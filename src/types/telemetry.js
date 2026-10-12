/**
 * @file telemetry.js
 * Typed data structures and schema validators for Rover Telemetry.
 * Enforces strict safety rules:
 * - Missing values are represented as null/undefined, NEVER zero.
 * - Missing gas readings never imply safety ("UNKNOWN / SENSOR OFFLINE").
 * - Missing evidence prevents positive human classification ("INSUFFICIENT_EVIDENCE").
 */

/**
 * Valid sensor connection states
 * @typedef {'CONNECTED' | 'DISCONNECTED' | 'STALE' | 'ERROR' | 'LOADING'} SensorConnectionStatus
 */

/**
 * Valid system operating states
 * @typedef {'OPTIMAL' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE'} SystemOperationalStatus
 */

/**
 * Valid human classification states
 * @typedef {'HUMAN_CONFIRMED' | 'UNCERTAIN' | 'NO_HUMAN_DETECTED' | 'INSUFFICIENT_EVIDENCE'} HumanDetectionState
 */

/**
 * Valid environmental hazard risk states
 * @typedef {'NOMINAL' | 'ELEVATED' | 'HAZARD' | 'UNKNOWN'} EnvironmentalRiskLevel
 */

/**
 * Thermal Sensor Telemetry Structure
 * @typedef {Object} ThermalTelemetry
 * @property {string} sensorId - Hardware identifier (e.g., 'FLIR-LEPTON-3.5')
 * @property {SensorConnectionStatus} status - Hardware connectivity state
 * @property {number|null} targetTemp - Measured target temperature in °C (null if disconnected)
 * @property {number|null} ambientTemp - Measured ambient background temp in °C
 * @property {string|null} deltaText - Temperature delta string (e.g. '+17.4°C') or null
 * @property {number|null} rawConfidence - Raw model confidence score [0.0 - 1.0] or null
 * @property {number[]} history - Array of recent temperature samples for trend display
 * @property {string|null} lastUpdated - ISO or UTC timestamp of last reading
 * @property {string|null} errorMessage - Error description if status === 'ERROR'
 */

/**
 * mmWave Radar Telemetry Structure
 * @typedef {Object} MmWaveTelemetry
 * @property {string} sensorId - Hardware identifier (e.g., 'TI-IWR6843')
 * @property {SensorConnectionStatus} status - Connectivity state
 * @property {'CONFIRMED' | 'MOTION' | 'CLEAR' | 'UNKNOWN'} presenceState - Radar presence
 * @property {number|null} distanceMeters - Distance to target in meters or null
 * @property {string|null} microDopplerRate - Biometric chest displacement or null
 * @property {number|null} rawConfidence - Raw sensor detection score [0.0 - 1.0] or null
 * @property {number[]} history - Signal amplitude history array
 * @property {string|null} lastUpdated - Timestamp of last packet
 * @property {string|null} errorMessage - Error description
 */

/**
 * Gas & Environmental Safety Telemetry Structure
 * Note: Strictly isolated from human detection logic.
 * @typedef {Object} GasTelemetry
 * @property {string} sensorId - Hardware identifier (e.g., 'MQ-ARRAY-01')
 * @property {SensorConnectionStatus} status - Connectivity state
 * @property {EnvironmentalRiskLevel} hazardLevel - Overall air safety state
 * @property {number|null} coPpm - Carbon Monoxide reading in PPM or null
 * @property {number|null} combustibleLel - Lower Explosive Limit percentage or null
 * @property {number|null} vocPpb - Volatile Organic Compounds in PPB or null
 * @property {number|null} oxygenPercent - Oxygen concentration percentage or null
 * @property {string|null} lastUpdated - Timestamp
 * @property {string|null} errorMessage - Error message
 */

/**
 * Camera Stream Metadata Structure
 * @typedef {Object} CameraStreamMetadata
 * @property {string} cameraId - Camera hardware ID
 * @property {'STREAMING' | 'PAUSED' | 'OFFLINE' | 'ERROR' | 'CONNECTING'} status - Stream status
 * @property {string|null} resolution - Video resolution (e.g., '1920x1080') or null
 * @property {number|null} fps - Measured frames per second or null
 * @property {string|null} codec - Encoding codec (e.g., 'H.265') or null
 * @property {number|null} packetLossPercent - Packet loss percentage or null
 * @property {number|null} latencyMs - End-to-end video latency in ms or null
 * @property {string|null} streamUrl - Real stream endpoint URL or null
 * @property {string|null} lastFrameTimestamp - Last received frame timestamp
 */

/**
 * YOLO Detection Annotation Structure
 * @typedef {Object} YoloDetection
 * @property {string} trackId - Tracking identifier (e.g., '#TRK-108')
 * @property {string} classLabel - Classification label (e.g., 'person')
 * @property {number} confidence - Inference confidence [0.0 - 1.0]
 * @property {{ top: string, left: string, width: string, height: string }} boundingBox - Relative viewport coordinates
 * @property {number|null} distanceEstimate - Optical depth estimate in meters if available
 */

/**
 * Multi-Modal Human Detection Fusion Output Structure
 * Only fuses Thermal, mmWave, and Camera/YOLO. Gas is NEVER included.
 * @typedef {Object} HumanDetectionFusion
 * @property {HumanDetectionState} state - Fused classification outcome
 * @property {number|null} overallConfidence - Fused confidence score [0.0 - 1.0], or null if insufficient
 * @property {string} fusionAlgorithm - Name and version of fusion algorithm
 * @property {string|null} lastDetectionTimestamp - Timestamp of last positive or evaluated detection
 * @property {{
 *   thermal: { available: boolean, metric: string|null, score: number|null, detail: string },
 *   mmWave: { available: boolean, metric: string|null, score: number|null, detail: string },
 *   cameraYolo: { available: boolean, metric: string|null, score: number|null, detail: string }
 * }} evidence - Evidence channels
 * @property {string} statusReason - Explanation of fusion outcome or reason for insufficiency
 */

/**
 * Mission Record Structure
 * @typedef {Object} MissionRecord
 * @property {string} id - Mission ID
 * @property {string} code - Mission code (e.g., 'MSN-2026-09')
 * @property {string} name - Mission descriptive title
 * @property {string} date - Date of deployment
 * @property {string} startTime - Start time
 * @property {string|null} endTime - End time or null if active
 * @property {'IN_PROGRESS' | 'COMPLETED' | 'ABORTED'} status - Mission status
 * @property {string} location - Operation location
 * @property {number} survivorsFound - Verified survivors located
 * @property {string} hazardsDetected - Known site hazards
 * @property {Array<{ id: string, time: string, summary: string, severity: 'info'|'warning'|'critical' }>} events
 */

/**
 * Validation helper for Thermal Telemetry
 * @param {any} data
 * @returns {ThermalTelemetry}
 */
export function validateThermalTelemetry(data) {
  if (!data || typeof data !== 'object') {
    return {
      sensorId: 'UNKNOWN-THERMAL',
      status: 'DISCONNECTED',
      targetTemp: null,
      ambientTemp: null,
      deltaText: null,
      rawConfidence: null,
      history: [],
      lastUpdated: null,
      errorMessage: 'Telemetry payload missing or invalid'
    };
  }

  const isConnected = data.status === 'CONNECTED';
  return {
    sensorId: String(data.sensorId || 'FLIR-LEPTON'),
    status: isConnected ? 'CONNECTED' : (data.status || 'DISCONNECTED'),
    targetTemp: (isConnected && typeof data.targetTemp === 'number') ? data.targetTemp : null,
    ambientTemp: (isConnected && typeof data.ambientTemp === 'number') ? data.ambientTemp : null,
    deltaText: isConnected ? data.deltaText || null : null,
    rawConfidence: (isConnected && typeof data.rawConfidence === 'number') ? data.rawConfidence : null,
    history: Array.isArray(data.history) ? data.history : [],
    lastUpdated: data.lastUpdated || null,
    errorMessage: data.errorMessage || null,
  };
}

/**
 * Validation helper for mmWave Telemetry
 * @param {any} data
 * @returns {MmWaveTelemetry}
 */
export function validateMmWaveTelemetry(data) {
  if (!data || typeof data !== 'object') {
    return {
      sensorId: 'UNKNOWN-MMWAVE',
      status: 'DISCONNECTED',
      presenceState: 'UNKNOWN',
      distanceMeters: null,
      microDopplerRate: null,
      rawConfidence: null,
      history: [],
      lastUpdated: null,
      errorMessage: 'Radar payload missing or invalid'
    };
  }

  const isConnected = data.status === 'CONNECTED';
  return {
    sensorId: String(data.sensorId || 'TI-IWR6843'),
    status: isConnected ? 'CONNECTED' : (data.status || 'DISCONNECTED'),
    presenceState: isConnected ? (data.presenceState || 'CLEAR') : 'UNKNOWN',
    distanceMeters: (isConnected && typeof data.distanceMeters === 'number') ? data.distanceMeters : null,
    microDopplerRate: isConnected ? data.microDopplerRate || null : null,
    rawConfidence: (isConnected && typeof data.rawConfidence === 'number') ? data.rawConfidence : null,
    history: Array.isArray(data.history) ? data.history : [],
    lastUpdated: data.lastUpdated || null,
    errorMessage: data.errorMessage || null,
  };
}

/**
 * Validation helper for Gas Telemetry
 * Note: Never assumes safe atmosphere when disconnected.
 * @param {any} data
 * @returns {GasTelemetry}
 */
export function validateGasTelemetry(data) {
  if (!data || typeof data !== 'object' || data.status !== 'CONNECTED') {
    return {
      sensorId: String(data?.sensorId || 'MQ-GAS-ARRAY'),
      status: data?.status === 'STALE' ? 'STALE' : (data?.status === 'ERROR' ? 'ERROR' : 'DISCONNECTED'),
      hazardLevel: 'UNKNOWN', // NEVER claim NOMINAL/SAFE when disconnected!
      coPpm: null,
      combustibleLel: null,
      vocPpb: null,
      oxygenPercent: null,
      lastUpdated: data?.lastUpdated || null,
      errorMessage: data?.errorMessage || (data?.status === 'CONNECTED' ? null : 'Gas sensor telemetry unavailable'),
    };
  }

  return {
    sensorId: String(data.sensorId || 'MQ-GAS-ARRAY'),
    status: 'CONNECTED',
    hazardLevel: data.hazardLevel || 'NOMINAL',
    coPpm: typeof data.coPpm === 'number' ? data.coPpm : null,
    combustibleLel: typeof data.combustibleLel === 'number' ? data.combustibleLel : null,
    vocPpb: typeof data.vocPpb === 'number' ? data.vocPpb : null,
    oxygenPercent: typeof data.oxygenPercent === 'number' ? data.oxygenPercent : null,
    lastUpdated: data.lastUpdated || null,
    errorMessage: null,
  };
}
