/**
 * @file websocketService.js
 * Robust WebSocket client for real-time telemetry streaming.
 * Features:
 * - Bounded exponential backoff reconnection.
 * - Out-of-order and stale message protection (sequence number & timestamp checking).
 * - Duplicate connection guards.
 * - Clean teardown and unmount handling.
 */

import { adaptBackendFrameToFrontend } from './telemetryAdapter';

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000';

export class TelemetryWebSocketClient {
  constructor(wsBaseUrl = WS_BASE_URL) {
    this.wsBaseUrl = wsBaseUrl.replace(/\/+$/, '');
    this.socket = null;
    this.status = 'DISCONNECTED'; // 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'
    this.statusListeners = new Set();
    this.messageListeners = new Set();

    // Bounded Exponential Backoff Configuration
    this.initialDelayMs = 1000;
    this.maxDelayMs = 8000;
    this.backoffMultiplier = 1.5;
    this.currentDelayMs = this.initialDelayMs;
    this.reconnectTimer = null;
    this.isExplicitlyClosed = false;

    // Stale message prevention
    this.lastSequenceNumber = -1;
    this.lastTimestampMs = 0;
  }

  /**
   * Connect to WebSocket telemetry endpoint
   */
  connect() {
    // Guard against duplicate connection attempts
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this._setStatus(this.status === 'DISCONNECTED' ? 'CONNECTING' : 'RECONNECTING');

    const wsUrl = `${this.wsBaseUrl}/api/ws/telemetry`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this._setStatus('CONNECTED');
        this.currentDelayMs = this.initialDelayMs; // Reset backoff on success
      };

      this.socket.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);

          // Sequence & Stale Message Guard
          if (typeof raw.seq === 'number') {
            if (raw.seq <= this.lastSequenceNumber) {
              console.warn(`[WebSocket] Stale frame dropped: seq ${raw.seq} <= last ${this.lastSequenceNumber}`);
              return;
            }
            this.lastSequenceNumber = raw.seq;
          }

          if (raw.timestamp) {
            const frameTimeMs = new Date(raw.timestamp).getTime();
            if (!isNaN(frameTimeMs) && frameTimeMs < this.lastTimestampMs) {
              console.warn(`[WebSocket] Out-of-order timestamp dropped: ${raw.timestamp}`);
              return;
            }
            this.lastTimestampMs = frameTimeMs;
          }

          // Adapt and Validate payload
          const adaptedTelemetry = adaptBackendFrameToFrontend(raw);
          this._notifyMessage(adaptedTelemetry);
        } catch (err) {
          console.error('[WebSocket] Message parsing or adaptation error:', err);
        }
      };

      this.socket.onerror = (_err) => {
        console.warn('[WebSocket] Transport error on telemetry connection');
      };

      this.socket.onclose = () => {
        this.socket = null;
        if (!this.isExplicitlyClosed) {
          this._setStatus('RECONNECTING');
          this._scheduleReconnect();
        } else {
          this._setStatus('DISCONNECTED');
        }
      };
    } catch (err) {
      console.error('[WebSocket] Connection initialization error:', err);
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule reconnect with bounded exponential backoff
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.isExplicitlyClosed) return;

    this.reconnectTimer = setTimeout(() => {
      this.currentDelayMs = Math.min(this.currentDelayMs * this.backoffMultiplier, this.maxDelayMs);
      this.connect();
    }, this.currentDelayMs);
  }

  /**
   * Cleanly disconnect and cancel all pending timers
   */
  disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this._setStatus('DISCONNECTED');
    this.currentDelayMs = this.initialDelayMs;
    this.lastSequenceNumber = -1;
    this.lastTimestampMs = 0;
  }

  /**
   * Listen to connection state updates
   */
  onStatusChange(callback) {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  /**
   * Listen to incoming telemetry frames
   */
  onMessage(callback) {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  _setStatus(newStatus) {
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      listener(this.status);
    }
  }

  _notifyMessage(data) {
    for (const listener of this.messageListeners) {
      listener(data);
    }
  }
}

export const wsClient = new TelemetryWebSocketClient();
