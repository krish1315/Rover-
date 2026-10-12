// Realistic mock telemetry data for Rescue Rover AI Disaster Response System
// Clearly demarcated as simulated mission data when actual hardware is offline

export const INITIAL_SYSTEM_STATUS = {
  roverId: "ARES-ROVER-04",
  systemStatus: "OPTIMAL", // "OPTIMAL" | "DEGRADED" | "CRITICAL"
  roverConnection: "CONNECTED", // "CONNECTED" | "STANDBY" | "DISCONNECTED"
  cameraConnection: "STREAMING", // "STREAMING" | "STANDBY" | "OFFLINE"
  hardwareLatencyMs: 24,
  batteryLevel: 84, // percentage
  batteryVoltage: "24.8V",
  telemetrySource: "SIMULATION_FEED", // Explicitly indicates whether live or simulated
};

export const INITIAL_SENSOR_DATA = {
  thermal: {
    name: "FLIR Radiometric Lepton",
    status: "CONNECTED",
    currentTemp: 36.8, // Human surface heat signature detected
    unit: "°C",
    ambientTemp: 19.4,
    delta: "+17.4°C",
    confidence: 0.89, // 89%
    maxDetected: 37.4,
    minDetected: 18.2,
    history: [19.2, 19.5, 20.1, 21.0, 24.5, 31.2, 35.8, 36.8, 36.5, 36.8],
  },
  mmWave: {
    name: "TI IWR6843 mmWave Radar",
    status: "CONNECTED",
    presence: "HUMAN_CONFIRMED", // "HUMAN_CONFIRMED" | "MOTION_ONLY" | "CLEAR"
    distanceMeters: 2.35,
    confidence: 0.93, // 93%
    breathingDetected: true,
    microDopplerRate: "14.2 bpm", // Micro-doppler chest displacement frequency
    history: [0.1, 0.1, 0.2, 0.4, 0.8, 0.95, 0.92, 0.94, 0.93, 0.93],
  },
  gas: {
    name: "Multi-Gas Array (MQ-4/MQ-135)",
    status: "CONNECTED",
    airQualityIndex: "NORMAL", // "NORMAL" | "ELEVATED" | "HAZARD"
    coPpm: 4.2, // Carbon monoxide PPM (Safe < 9ppm)
    combustibleGasLel: 1.1, // Lower explosive limit %
    vocPpb: 125, // Volatile Organic Compounds ppb
    oxygenPercent: 20.8, // Atmospheric normal
    environmentalHazardLevel: "LOW_RISK",
    history: [3.8, 3.9, 4.0, 4.1, 4.3, 4.2, 4.1, 4.2, 4.2, 4.2],
    // Note: Gas sensor data strictly excluded from human detection calculations
  },
};

export const INITIAL_HUMAN_DETECTION = {
  status: "HUMAN_DETECTED", // "HUMAN_DETECTED" | "UNCERTAIN" | "NO_HUMAN"
  overallConfidence: 0.92, // 92% multi-modal fused confidence
  fusionAlgorithm: "Tri-Modal Bayesian Fusion v2.4",
  lastDetectionTimestamp: "23:46:12 UTC",
  evidence: {
    thermal: {
      label: "Thermal Anomaly",
      state: "POSITIVE",
      metric: "36.8°C Hotspot",
      confidence: 0.89,
      detail: "Localized body temperature anomaly matches human signature",
    },
    mmWave: {
      label: "mmWave Radar",
      state: "POSITIVE",
      metric: "2.35m / 14 bpm Micro-Doppler",
      confidence: 0.93,
      detail: "Biometric breathing displacement verified behind light debris",
    },
    cameraYolo: {
      label: "Optical YOLOv11x",
      state: "POSITIVE",
      metric: "person (0.94)",
      confidence: 0.94,
      detail: "Upper torso and arm visible in low-light camera feed",
    },
  },
  timeline: [
    {
      id: "det-1",
      time: "23:46:12",
      type: "TRI_MODAL_CONFIRMED",
      summary: "Human verified: Thermal 36.8°C + mmWave 2.35m + YOLO 94%",
      severity: "critical",
    },
    {
      id: "det-2",
      time: "23:45:50",
      type: "MMWAVE_BREATHING",
      summary: "Micro-Doppler chest oscillation detected at 2.4m",
      severity: "warning",
    },
    {
      id: "det-3",
      time: "23:45:18",
      type: "THERMAL_HOTSPOT",
      summary: "Elevated thermal signature (35.4°C) identified in quadrant B",
      severity: "warning",
    },
    {
      id: "det-4",
      time: "23:44:02",
      type: "ENVIRONMENTAL_CHECK",
      summary: "CO levels nominal (4.1 ppm) - Sector safe for human respiration",
      severity: "info",
    },
  ],
};

export const MOCK_MISSIONS = [
  {
    id: "msn-09",
    name: "Sector 4 Collapse Search",
    code: "MISSION-2026-09",
    date: "2026-10-10",
    time: "22:15 - ACTIVE",
    status: "IN_PROGRESS",
    location: "Metro Transit Tunnel Shaft B",
    survivorsFound: 1,
    hazardsDetected: "Moderate structural dust",
    duration: "1h 31m",
  },
  {
    id: "msn-08",
    name: "Alpine Warehouse Seismic Audit",
    code: "MISSION-2026-08",
    date: "2026-10-09",
    time: "14:20 - 16:45",
    status: "COMPLETED",
    location: "Industrial District Sub-level 1",
    survivorsFound: 2,
    hazardsDetected: "Elevated methane (12% LEL)",
    duration: "2h 25m",
  },
  {
    id: "msn-07",
    name: "Quarry Landslide Void Exploration",
    code: "MISSION-2026-07",
    date: "2026-10-07",
    time: "08:10 - 11:30",
    status: "COMPLETED",
    location: "North Basin Extraction Site",
    survivorsFound: 0,
    hazardsDetected: "Unstable rock pile, 0 ppm gas",
    duration: "3h 20m",
  },
  {
    id: "msn-06",
    name: "Subway Concourse Flooding Recon",
    code: "MISSION-2026-06",
    date: "2026-10-04",
    time: "19:00 - 21:10",
    status: "COMPLETED",
    location: "Central Station Platform 3",
    survivorsFound: 3,
    hazardsDetected: "Water level 45cm, electrical risk",
    duration: "2h 10m",
  },
];
