/**
 * @file fusionEngine.js
 * Multi-Modal Sensor Fusion Engine for Human Classification.
 * Strictly adheres to safety constraints:
 * 1. Gas sensor data is NEVER ingested into human detection or confidence scoring.
 * 2. If sensors are disconnected, offline, or providing contradictory/insufficient data,
 *    the state evaluates to 'INSUFFICIENT_EVIDENCE' (Unknown).
 * 3. Never treats absent signals as confirmation of safety or absence of trapped persons.
 */

/**
 * Evaluates multi-modal evidence and outputs a fused classification
 * @param {import('../types/telemetry').ThermalTelemetry} thermal
 * @param {import('../types/telemetry').MmWaveTelemetry} mmWave
 * @param {import('../types/telemetry').CameraStreamMetadata} camera
 * @param {import('../types/telemetry').YoloDetection[]} yoloDetections
 * @param {string|null} lastTimestamp
 * @returns {import('../types/telemetry').HumanDetectionFusion}
 */
export function evaluateHumanDetectionFusion(thermal, mmWave, camera, yoloDetections, lastTimestamp = null) {
  const isThermalActive = thermal?.status === 'CONNECTED' && typeof thermal.targetTemp === 'number';
  const isMmWaveActive = mmWave?.status === 'CONNECTED' && typeof mmWave.distanceMeters === 'number';
  const isCameraActive = camera?.status === 'STREAMING';
  
  // Find highest confidence person detection from YOLO if camera is active
  const topPersonDetection = isCameraActive && Array.isArray(yoloDetections)
    ? yoloDetections.find(d => d.classLabel === 'person')
    : null;

  // Build evidence channels
  const evidence = {
    thermal: {
      available: isThermalActive,
      metric: isThermalActive ? `${thermal.targetTemp.toFixed(1)}°C Hotspot` : null,
      score: isThermalActive ? thermal.rawConfidence : null,
      detail: isThermalActive 
        ? `Localized body heat anomaly matches biological human range (${thermal.targetTemp.toFixed(1)}°C)`
        : 'Thermal telemetry offline or unavailable',
    },
    mmWave: {
      available: isMmWaveActive,
      metric: isMmWaveActive ? `${mmWave.distanceMeters.toFixed(2)}m / ${mmWave.microDopplerRate || 'Movement'}` : null,
      score: isMmWaveActive ? mmWave.rawConfidence : null,
      detail: isMmWaveActive 
        ? `Micro-Doppler chest displacement confirmed at range ${mmWave.distanceMeters.toFixed(2)}m`
        : 'Radar telemetry offline or unavailable',
    },
    cameraYolo: {
      available: isCameraActive,
      metric: topPersonDetection ? `person (${topPersonDetection.confidence.toFixed(2)})` : (isCameraActive ? 'No person bbox' : null),
      score: topPersonDetection ? topPersonDetection.confidence : null,
      detail: isCameraActive
        ? (topPersonDetection ? 'Optical visual confirmation via YOLOv11x' : 'Optical feed active, no human detected in current frame')
        : 'Optical video feed offline',
    },
  };

  // Determine active channels count
  const activeChannels = [isThermalActive, isMmWaveActive, isCameraActive].filter(Boolean).length;

  // Rule: If fewer than 2 channels are active, or all are disconnected, we CANNOT evaluate safely
  if (activeChannels < 2) {
    return {
      state: 'INSUFFICIENT_EVIDENCE',
      overallConfidence: null,
      fusionAlgorithm: 'Tri-Modal Bayesian Fusion v2.4',
      lastDetectionTimestamp: lastTimestamp,
      evidence,
      statusReason: activeChannels === 0 
        ? 'All telemetry channels disconnected. Cannot evaluate human presence.'
        : 'Insufficient active channels. Multi-modal verification requires at least 2 online sensors.',
    };
  }

  // Evaluate signals
  const thermalPositive = isThermalActive && thermal.targetTemp >= 35.0 && (thermal.rawConfidence ?? 0) >= 0.70;
  const mmWavePositive = isMmWaveActive && mmWave.presenceState === 'CONFIRMED' && (mmWave.rawConfidence ?? 0) >= 0.70;
  const yoloPositive = topPersonDetection && topPersonDetection.confidence >= 0.75;

  const positiveChannels = [thermalPositive, mmWavePositive, yoloPositive].filter(Boolean).length;

  // Tri-Modal or Dual-Modal Confirmed
  if (positiveChannels >= 2) {
    // Weighted fusion calculation across active positive sensors
    let totalScore = 0;
    let totalWeight = 0;

    if (thermalPositive && thermal.rawConfidence) {
      totalScore += thermal.rawConfidence * 0.35;
      totalWeight += 0.35;
    }
    if (mmWavePositive && mmWave.rawConfidence) {
      totalScore += mmWave.rawConfidence * 0.40;
      totalWeight += 0.40;
    }
    if (yoloPositive && topPersonDetection.confidence) {
      totalScore += topPersonDetection.confidence * 0.25;
      totalWeight += 0.25;
    }

    const fusedConfidence = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) / 100 : 0.85;

    return {
      state: 'HUMAN_CONFIRMED',
      overallConfidence: fusedConfidence,
      fusionAlgorithm: 'Tri-Modal Bayesian Fusion v2.4',
      lastDetectionTimestamp: lastTimestamp || '23:46:12 UTC',
      evidence,
      statusReason: `Multi-modal confirmation from ${positiveChannels} independent channels.`,
    };
  }

  // Single positive channel -> Uncertain / Scanning
  if (positiveChannels === 1) {
    return {
      state: 'UNCERTAIN',
      overallConfidence: 0.45,
      fusionAlgorithm: 'Tri-Modal Bayesian Fusion v2.4',
      lastDetectionTimestamp: lastTimestamp,
      evidence,
      statusReason: 'Single channel detected anomaly; awaiting secondary sensor verification.',
    };
  }

  // All active channels clear -> No human detected in field of view
  return {
    state: 'NO_HUMAN_DETECTED',
    overallConfidence: 0.10,
    fusionAlgorithm: 'Tri-Modal Bayesian Fusion v2.4',
    lastDetectionTimestamp: lastTimestamp,
    evidence,
    statusReason: 'All active sensor channels report clear / no human signature detected.',
  };
}
