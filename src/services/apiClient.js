/**
 * @file apiClient.js
 * Centralized REST API client for Rescue Rover FastAPI backend.
 * Uses environment variable VITE_API_BASE_URL with graceful timeout handling.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Safe fetch with timeout
   */
  async _request(endpoint, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {}),
        },
      });

      if (!response.ok) {
        throw new Error(`API error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Health check
   */
  async checkHealth() {
    return this._request('/api/health', { method: 'GET' }, 2500);
  }

  /**
   * Fetch current system & rover status
   */
  async getSystemStatus() {
    return this._request('/api/system/status');
  }

  /**
   * Fetch latest full telemetry snapshot
   */
  async getLatestTelemetry() {
    return this._request('/api/telemetry/latest');
  }

  /**
   * Fetch mission archive list
   */
  async getMissions() {
    return this._request('/api/missions');
  }

  /**
   * Fetch mission details
   */
  async getMission(missionId) {
    return this._request(`/api/missions/${encodeURIComponent(missionId)}`);
  }

  /**
   * Fetch mission events
   */
  async getMissionEvents(missionId) {
    return this._request(`/api/missions/${encodeURIComponent(missionId)}/events`);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
