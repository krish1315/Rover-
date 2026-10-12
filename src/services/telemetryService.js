/**
 * @file telemetryService.js
 * Unified Telemetry Service for Rover Dashboard.
 * Integrates:
 * - Live FastAPI REST initial state & mission history.
 * - Live WebSocket streaming with sequence verification.
 * - Local Mock Scenarios fallback when backend is offline.
 * - Real-time Telemetry Age tracking.
 */

import { SCENARIOS } from '../data/mockScenarios';
import { 
  validateThermalTelemetry, 
  validateMmWaveTelemetry, 
  validateGasTelemetry 
} from '../types/telemetry';
import { evaluateHumanDetectionFusion } from './fusionEngine';
import { apiClient } from './apiClient';
import { wsClient } from './websocketService';
import { adaptBackendFrameToFrontend } from './telemetryAdapter';

class TelemetryService {
  constructor() {
    this.mode = 'LIVE'; // 'LIVE' | 'MOCK'
    this.currentScenarioId = 'DEMO_CONFIRMED';
    this.backendStatus = 'CONNECTING'; // 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'
    this.lastReceivedTimestamp = null;
    this.lastReceivedSeq = null;

    this.subscribers = new Set();
    this.state = this._buildInitialState();

    this.simIntervalId = null;
    this.ageIntervalId = null;

    // Initialize connections
    this._initBackendIntegration();
    this._startAgeTracker();
  }

  _buildInitialState() {
    return {
      mode: this.mode,
      backendStatus: this.backendStatus,
      scenarioId: this.currentScenarioId,
      scenarioLabel: 'Live FastAPI Telemetry',
      scenarioDescription: 'Real-time WebSocket & REST link to rover backend',
      isMock: false,
      telemetryAgeSeconds: null,
      lastReceivedTimestamp: null,
      lastReceivedSeq: null,
      system: {
        roverId: 'ARES-ROVER-04',
        systemStatus: 'OPTIMAL',
        roverConnection: 'CONNECTED',
        cameraConnection: 'STREAMING',
        hardwareLatencyMs: null,
        batteryLevel: null,
        batteryVoltage: null,
      },
      thermal: validateThermalTelemetry(null),
      mmWave: validateMmWaveTelemetry(null),
      gas: validateGasTelemetry(null),
      camera: {
        cameraId: 'CAM-OPTICAL-01',
        status: 'CONNECTING',
        resolution: null,
        fps: null,
        codec: null,
        packetLossPercent: null,
        latencyMs: null,
        streamUrl: null,
        lastFrameTimestamp: null,
      },
      yoloDetections: [],
      fusion: {
        state: 'INSUFFICIENT_EVIDENCE',
        overallConfidence: null,
        fusionAlgorithm: 'Tri-Modal Bayesian Fusion v2.4',
        lastDetectionTimestamp: null,
        evidence: {
          thermal: { available: false, metric: null, score: null, detail: 'Awaiting backend stream' },
          mmWave: { available: false, metric: null, score: null, detail: 'Awaiting backend stream' },
          cameraYolo: { available: false, metric: null, score: null, detail: 'Awaiting backend stream' },
        },
        statusReason: 'Connecting to telemetry stream...',
      },
      timeline: [],
    };
  }

  /**
   * Set up WebSocket and initial REST hydration
   */
  async _initBackendIntegration() {
    // 1. Listen for WebSocket status changes
    this.unsubWsStatus = wsClient.onStatusChange((status) => {
      this.backendStatus = status;
      this.state.backendStatus = status;

      // If backend disconnected while in live mode, update state
      if (status === 'DISCONNECTED' && this.mode === 'LIVE') {
        this.state.system.roverConnection = 'DISCONNECTED';
      }
      this._notify();
    });

    // 2. Listen for real-time WebSocket frames
    this.unsubWsMessage = wsClient.onMessage((adaptedFrame) => {
      if (this.mode !== 'LIVE') return;

      this.lastReceivedTimestamp = adaptedFrame.timestamp;
      this.lastReceivedSeq = adaptedFrame.seq;

      this.state = {
        ...this.state,
        mode: 'LIVE',
        backendStatus: 'CONNECTED',
        isMock: false,
        scenarioLabel: 'Live Backend Stream',
        scenarioDescription: 'Streaming live telemetry from FastAPI over WebSockets',
        lastReceivedTimestamp: adaptedFrame.timestamp,
        lastReceivedSeq: adaptedFrame.seq,
        telemetryAgeSeconds: 0,
        system: { ...adaptedFrame.system },
        thermal: { ...adaptedFrame.thermal },
        mmWave: { ...adaptedFrame.mmWave },
        gas: { ...adaptedFrame.gas },
        camera: { ...adaptedFrame.camera },
        yoloDetections: [...adaptedFrame.yoloDetections],
        fusion: { ...adaptedFrame.fusion },
      };

      this._notify();
    });

    // 3. Connect to live backend if in LIVE mode
    if (this.mode === 'LIVE') {
      this._connectToLiveBackend();
    }
  }

  async _connectToLiveBackend() {
    try {
      // Fetch initial REST snapshot
      const rawLatest = await apiClient.getLatestTelemetry();
      const adapted = adaptBackendFrameToFrontend(rawLatest);

      this.lastReceivedTimestamp = adapted.timestamp;
      this.lastReceivedSeq = adapted.seq;

      this.state = {
        ...this.state,
        mode: 'LIVE',
        backendStatus: 'CONNECTED',
        isMock: false,
        scenarioLabel: 'Live Backend Stream',
        lastReceivedTimestamp: adapted.timestamp,
        lastReceivedSeq: adapted.seq,
        telemetryAgeSeconds: 0,
        system: { ...adapted.system },
        thermal: { ...adapted.thermal },
        mmWave: { ...adapted.mmWave },
        gas: { ...adapted.gas },
        camera: { ...adapted.camera },
        yoloDetections: [...adapted.yoloDetections],
        fusion: { ...adapted.fusion },
      };
      this._notify();
    } catch (err) {
      console.warn('[TelemetryService] REST hydration failed; attempting WebSocket link...', err.message);
    }

    // Connect WebSocket
    wsClient.connect();
  }

  /**
   * Periodic tracker for age of latest telemetry
   */
  _startAgeTracker() {
    if (this.ageIntervalId) clearInterval(this.ageIntervalId);

    this.ageIntervalId = setInterval(() => {
      if (this.lastReceivedTimestamp) {
        const timeDiffSec = (Date.now() - new Date(this.lastReceivedTimestamp).getTime()) / 1000;
        const roundedAge = Math.max(0, Math.round(timeDiffSec * 10) / 10);
        
        if (this.state.telemetryAgeSeconds !== roundedAge) {
          this.state.telemetryAgeSeconds = roundedAge;

          // If telemetry age > 10s and backend was connected, flag stale
          if (roundedAge > 10 && this.state.system.roverConnection === 'CONNECTED') {
            this.state.system.roverConnection = 'STALE';
          }

          this._notify();
        }
      }
    }, 1000);
  }

  /**
   * Switch operational mode: 'LIVE' or 'MOCK'
   */
  setMode(mode) {
    this.mode = mode;
    if (mode === 'LIVE') {
      this._connectToLiveBackend();
    } else {
      wsClient.disconnect();
      this.setScenario(this.currentScenarioId);
    }
  }

  /**
   * Apply a mock scenario
   */
  setScenario(scenarioId) {
    const raw = SCENARIOS[scenarioId] || SCENARIOS.DEMO_CONFIRMED;
    this.currentScenarioId = scenarioId;
    this.mode = 'MOCK';
    wsClient.disconnect();

    const validatedThermal = validateThermalTelemetry(raw.thermal);
    const validatedMmWave = validateMmWaveTelemetry(raw.mmWave);
    const validatedGas = validateGasTelemetry(raw.gas);
    const camera = { ...raw.camera };
    const yoloDetections = Array.isArray(raw.yoloDetections) ? [...raw.yoloDetections] : [];

    const fusion = evaluateHumanDetectionFusion(
      validatedThermal,
      validatedMmWave,
      camera,
      yoloDetections,
      raw.thermal.lastUpdated || raw.system.lastUpdated
    );

    this.lastReceivedTimestamp = new Date().toISOString();

    this.state = {
      mode: 'MOCK',
      backendStatus: this.backendStatus,
      scenarioId: raw.id,
      scenarioLabel: raw.label,
      scenarioDescription: raw.description,
      isMock: true,
      telemetryAgeSeconds: 0,
      lastReceivedTimestamp: this.lastReceivedTimestamp,
      lastReceivedSeq: null,
      system: { ...raw.system },
      thermal: validatedThermal,
      mmWave: validatedMmWave,
      gas: validatedGas,
      camera,
      yoloDetections,
      fusion,
      timeline: [...raw.timeline],
    };

    this._notify();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.state);
    return () => this.subscribers.delete(callback);
  }

  _notify() {
    for (const sub of this.subscribers) {
      sub(this.state);
    }
  }
}

export const telemetryService = new TelemetryService();
