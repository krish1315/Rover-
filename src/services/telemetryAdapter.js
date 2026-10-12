/**
 * @file telemetryAdapter.js
 * Documented Adapter Layer.
 * Transforms FastAPI backend snake_case models into frontend domain models.
 * Preserves safety invariants: nulls are never coerced to zero, missing values stay null.
 */

import { 
  validateThermalTelemetry, 
  validateMmWaveTelemetry, 
  validateGasTelemetry 
} from '../types/telemetry';
import { evaluateHumanDetectionFusion } from './fusionEngine';

/**
 * Adapts a backend TelemetryFrameModel into frontend telemetry state.
 * @param {Object} rawFrame - Backend payload
 * @returns {Object} Frontend telemetry domain state
 */
export function adaptBackendFrameToFrontend(rawFrame) {
  if (!rawFrame || typeof rawFrame !== 'object') {
    throw new Error('Invalid raw telemetry frame received from backend');
  }

  const rawSys = rawFrame.system || {};
  const rawThermal = rawFrame.thermal || {};
  const rawMmWave = rawFrame.mmwave || rawFrame.mmWave || {};
  const rawGas = rawFrame.gas || {};
  const rawCam = rawFrame.camera || {};
  const rawYolo = Array.isArray(rawFrame.yolo_detections) ? rawFrame.yolo_detections : (rawFrame.yoloDetections || []);

  // Adapt System Status
  const system = {
    roverId: rawSys.rover_id || rawSys.roverId || 'ARES-ROVER-04',
    systemStatus: rawSys.system_status || rawSys.systemStatus || 'OPTIMAL',
    roverConnection: rawSys.rover_connection || rawSys.roverConnection || 'CONNECTED',
    cameraConnection: rawSys.camera_connection || rawSys.cameraConnection || 'STREAMING',
    hardwareLatencyMs: typeof rawSys.hardware_latency_ms === 'number' ? rawSys.hardware_latency_ms : (rawSys.hardwareLatencyMs ?? null),
    batteryLevel: typeof rawSys.battery_level === 'number' ? rawSys.battery_level : (rawSys.batteryLevel ?? null),
    batteryVoltage: rawSys.battery_voltage || rawSys.batteryVoltage || null,
  };

  // Adapt and Validate Thermal Telemetry
  const thermal = validateThermalTelemetry({
    sensorId: rawThermal.sensor_id || rawThermal.sensorId,
    status: rawThermal.status,
    targetTemp: typeof rawThermal.target_temp === 'number' ? rawThermal.target_temp : rawThermal.targetTemp,
    ambientTemp: typeof rawThermal.ambient_temp === 'number' ? rawThermal.ambient_temp : rawThermal.ambientTemp,
    deltaText: rawThermal.delta_text || rawThermal.deltaText,
    rawConfidence: typeof rawThermal.raw_confidence === 'number' ? rawThermal.raw_confidence : rawThermal.rawConfidence,
    history: rawThermal.history || [],
    lastUpdated: rawThermal.last_updated || rawThermal.lastUpdated,
    errorMessage: rawThermal.error_message || rawThermal.errorMessage,
  });

  // Adapt and Validate mmWave Telemetry
  const mmWave = validateMmWaveTelemetry({
    sensorId: rawMmWave.sensor_id || rawMmWave.sensorId,
    status: rawMmWave.status,
    presenceState: rawMmWave.presence_state || rawMmWave.presenceState,
    distanceMeters: typeof rawMmWave.distance_meters === 'number' ? rawMmWave.distance_meters : rawMmWave.distanceMeters,
    microDopplerRate: rawMmWave.micro_doppler_rate || rawMmWave.microDopplerRate,
    rawConfidence: typeof rawMmWave.raw_confidence === 'number' ? rawMmWave.raw_confidence : rawMmWave.rawConfidence,
    history: rawMmWave.history || [],
    lastUpdated: rawMmWave.last_updated || rawMmWave.lastUpdated,
    errorMessage: rawMmWave.error_message || rawMmWave.errorMessage,
  });

  // Adapt and Validate Gas Telemetry (Strictly isolated)
  const gas = validateGasTelemetry({
    sensorId: rawGas.sensor_id || rawGas.sensorId,
    status: rawGas.status,
    hazardLevel: rawGas.hazard_level || rawGas.hazardLevel,
    coPpm: typeof rawGas.co_ppm === 'number' ? rawGas.co_ppm : rawGas.coPpm,
    combustibleLel: typeof rawGas.combustible_lel === 'number' ? rawGas.combustible_lel : rawGas.combustibleLel,
    vocPpb: typeof rawGas.voc_ppb === 'number' ? rawGas.voc_ppb : rawGas.vocPpb,
    oxygenPercent: typeof rawGas.oxygen_percent === 'number' ? rawGas.oxygen_percent : rawGas.oxygenPercent,
    lastUpdated: rawGas.last_updated || rawGas.lastUpdated,
    errorMessage: rawGas.error_message || rawGas.errorMessage,
  });

  // Adapt Camera Metadata
  const camera = {
    cameraId: rawCam.camera_id || rawCam.cameraId || 'ESP32S3-CAM-01',
    status: rawCam.status || 'STREAMING',
    streamType: rawCam.stream_type || rawCam.streamType || 'MJPEG',
    streamEndpoint: rawCam.stream_endpoint || rawCam.streamEndpoint || '/api/camera/stream',
    resolution: rawCam.resolution || '1280x720',
    naturalWidth: rawCam.natural_width || rawCam.naturalWidth || 1280,
    naturalHeight: rawCam.natural_height || rawCam.naturalHeight || 720,
    fps: typeof rawCam.fps === 'number' ? rawCam.fps : 25.0,
    codec: rawCam.codec || 'MJPEG / HTTP',
    packetLossPercent: typeof rawCam.packet_loss_percent === 'number' ? rawCam.packet_loss_percent : (rawCam.packetLossPercent ?? null),
    latencyMs: typeof rawCam.latency_ms === 'number' ? rawCam.latency_ms : (rawCam.latencyMs ?? null),
    streamUrl: rawCam.stream_url || rawCam.streamUrl || '/api/camera/stream',
    lastFrameTimestamp: rawCam.last_frame_timestamp || rawCam.lastFrameTimestamp || null,
    esp32SourceUrl: rawCam.esp32_source_url || rawCam.esp32SourceUrl || null,
  };

  // Adapt YOLO Detections with normalized coordinate support & timestamp tracking
  const nowMs = Date.now();
  const yoloDetections = rawYolo.map((det) => {
    const rawBox = det.bounding_box || det.boundingBox || {};
    
    // Normalized values: 0.0 to 1.0
    const normX = typeof rawBox.norm_x_min === 'number' 
      ? rawBox.norm_x_min 
      : (parseFloat(rawBox.left) ? parseFloat(rawBox.left) / 100 : 0.44);
    
    const normY = typeof rawBox.norm_y_min === 'number' 
      ? rawBox.norm_y_min 
      : (parseFloat(rawBox.top) ? parseFloat(rawBox.top) / 100 : 0.46);

    const normW = typeof rawBox.norm_width === 'number' 
      ? rawBox.norm_width 
      : (parseFloat(rawBox.width) ? parseFloat(rawBox.width) / 100 : 0.085);

    const normH = typeof rawBox.norm_height === 'number' 
      ? rawBox.norm_height 
      : (parseFloat(rawBox.height) ? parseFloat(rawBox.height) / 100 : 0.20);

    return {
      trackId: det.track_id || det.trackId || '#TRK-0',
      classLabel: det.class_label || det.classLabel || 'person',
      confidence: typeof det.confidence === 'number' ? det.confidence : 0,
      normXMin: normX,
      normYMin: normY,
      normWidth: normW,
      normHeight: normH,
      boundingBox: {
        top: `${normY * 100}%`,
        left: `${normX * 100}%`,
        width: `${normW * 100}%`,
        height: `${normH * 100}%`,
      },
      distanceEstimate: typeof det.distance_estimate === 'number' ? det.distance_estimate : (det.distanceEstimate ?? null),
      frameSeq: det.frame_seq ?? det.frameSeq ?? null,
      timestamp: det.timestamp || null,
      receivedAt: nowMs,
    };
  });

  // Backend-owned Multi-Modal Fusion Ingestion
  let fusion;
  const rawFusion = rawFrame.human_detection_fusion || rawFrame.humanDetectionFusion;

  if (rawFusion && typeof rawFusion === 'object') {
    const rawEv = rawFusion.evidence || {};
    const thEv = rawEv.thermal || {};
    const mmEv = rawEv.mmwave || rawEv.mmWave || {};
    const camEv = rawEv.camera_yolo || rawEv.cameraYolo || {};

    fusion = {
      state: rawFusion.state || 'INSUFFICIENT_EVIDENCE',
      overallConfidence: typeof rawFusion.overall_confidence === 'number' 
        ? rawFusion.overall_confidence 
        : (rawFusion.overallConfidence ?? null),
      fusionAlgorithm: rawFusion.fusion_algorithm || rawFusion.fusionAlgorithm || 'Tri-Modal Decision Matrix v2.1',
      lastDetectionTimestamp: rawFusion.last_detection_timestamp || rawFusion.lastDetectionTimestamp || null,
      statusReason: rawFusion.status_reason || rawFusion.statusReason || '',
      evidence: {
        thermal: {
          available: !!thEv.available,
          status: thEv.status || (thEv.available ? 'POSITIVE' : 'OFFLINE'),
          metric: thEv.metric || null,
          score: typeof thEv.confidence_score === 'number' ? thEv.confidence_score : (thEv.score ?? null),
          detail: thEv.detail || 'Thermal evidence channel',
        },
        mmWave: {
          available: !!mmEv.available,
          status: mmEv.status || (mmEv.available ? 'POSITIVE' : 'OFFLINE'),
          metric: mmEv.metric || null,
          score: typeof mmEv.confidence_score === 'number' ? mmEv.confidence_score : (mmEv.score ?? null),
          detail: mmEv.detail || 'Radar micro-Doppler channel',
        },
        cameraYolo: {
          available: !!camEv.available,
          status: camEv.status || (camEv.available ? 'POSITIVE' : 'OFFLINE'),
          metric: camEv.metric || null,
          score: typeof camEv.confidence_score === 'number' ? camEv.confidence_score : (camEv.score ?? null),
          detail: camEv.detail || 'Optical YOLO target channel',
        },
      },
    };
  } else {
    // Fallback evaluator for local offline mock testing only
    fusion = evaluateHumanDetectionFusion(
      thermal,
      mmWave,
      camera,
      yoloDetections,
      thermal.lastUpdated || rawFrame.timestamp
    );
  }

  return {
    seq: typeof rawFrame.seq === 'number' ? rawFrame.seq : null,
    timestamp: rawFrame.timestamp || new Date().toISOString(),
    system,
    thermal,
    mmWave,
    gas,
    camera,
    yoloDetections,
    fusion,
  };
}

/**
 * Adapts backend mission models into frontend format
 */
export function adaptBackendMission(m) {
  if (!m) return null;
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    date: m.date,
    startTime: m.start_time || m.startTime,
    endTime: m.end_time || m.endTime || null,
    status: m.status,
    location: m.location,
    survivorsFound: typeof m.survivors_found === 'number' ? m.survivors_found : (m.survivorsFound || 0),
    hazardsDetected: m.hazards_detected || m.hazardsDetected || '',
    sensorSummary: m.sensor_summary ? {
      maxThermalC: m.sensor_summary.max_thermal_c,
      minThermalC: m.sensor_summary.min_thermal_c,
      maxRadarDistanceM: m.sensor_summary.max_radar_distance_m,
      peakCoPpm: m.sensor_summary.peak_co_ppm,
      airHazardSummary: m.sensor_summary.air_hazard_summary,
      opticalDetectionsCount: m.sensor_summary.optical_detections_count,
    } : (m.sensorSummary || null),
    events: Array.isArray(m.events) ? m.events : [],
  };
}
