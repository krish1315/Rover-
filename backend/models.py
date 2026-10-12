"""
Pydantic data models for Rescue Rover Telemetry & Mission API.
"""

from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field

class SystemStatusModel(BaseModel):
    rover_id: str = "ARES-ROVER-04"
    system_status: str = "OPTIMAL"  # OPTIMAL, DEGRADED, CRITICAL, OFFLINE
    rover_connection: str = "CONNECTED"  # CONNECTED, STALE, DISCONNECTED
    camera_connection: str = "STREAMING"  # STREAMING, PAUSED, OFFLINE
    hardware_latency_ms: Optional[int] = 22
    battery_level: Optional[int] = 84
    battery_voltage: Optional[str] = "24.8V"

class ThermalTelemetryModel(BaseModel):
    sensor_id: str = "FLIR-LEPTON-3.5"
    status: str = "CONNECTED"  # CONNECTED, STALE, DISCONNECTED, ERROR
    target_temp: Optional[float] = 36.8
    ambient_temp: Optional[float] = 19.4
    delta_text: Optional[str] = "+17.4°C"
    raw_confidence: Optional[float] = 0.89
    history: List[float] = Field(default_factory=lambda: [19.2, 19.5, 20.1, 21.0, 24.5, 31.2, 35.8, 36.8, 36.5, 36.8])
    last_updated: Optional[str] = None
    error_message: Optional[str] = None

class MmWaveTelemetryModel(BaseModel):
    sensor_id: str = "TI-IWR6843"
    status: str = "CONNECTED"
    presence_state: str = "CONFIRMED"  # CONFIRMED, MOTION, CLEAR, UNKNOWN
    distance_meters: Optional[float] = 2.35
    micro_doppler_rate: Optional[str] = "14.2 bpm"
    raw_confidence: Optional[float] = 0.93
    history: List[float] = Field(default_factory=lambda: [0.1, 0.1, 0.2, 0.4, 0.8, 0.95, 0.92, 0.94, 0.93, 0.93])
    last_updated: Optional[str] = None
    error_message: Optional[str] = None

class GasTelemetryModel(BaseModel):
    sensor_id: str = "MQ-ARRAY-01"
    status: str = "CONNECTED"
    hazard_level: str = "NOMINAL"  # NOMINAL, ELEVATED, HAZARD, UNKNOWN
    co_ppm: Optional[float] = 4.2
    combustible_lel: Optional[float] = 1.1
    voc_ppb: Optional[float] = 125.0
    oxygen_percent: Optional[float] = 20.8
    last_updated: Optional[str] = None
    error_message: Optional[str] = None

class CameraMetadataModel(BaseModel):
    camera_id: str = "ESP32S3-CAM-01"
    status: str = "STREAMING"  # STREAMING, PAUSED, OFFLINE, ERROR
    stream_type: str = "MJPEG"  # MJPEG over HTTP
    stream_endpoint: str = "/api/camera/stream"
    resolution: Optional[str] = "1280x720"
    natural_width: int = 1280
    natural_height: int = 720
    fps: Optional[float] = 25.0
    codec: Optional[str] = "MJPEG / HTTP"
    packet_loss_percent: Optional[float] = 0.00
    latency_ms: Optional[int] = 32
    stream_url: Optional[str] = "/api/camera/stream"
    last_frame_timestamp: Optional[str] = None
    esp32_source_url: Optional[str] = None

class BoundingBoxModel(BaseModel):
    norm_x_min: float = 0.44
    norm_y_min: float = 0.46
    norm_width: float = 0.085
    norm_height: float = 0.20
    top: Optional[str] = "46%"
    left: Optional[str] = "44%"
    width: Optional[str] = "8.5%"
    height: Optional[str] = "20%"

class YoloDetectionModel(BaseModel):
    track_id: str
    class_label: str
    confidence: float
    bounding_box: BoundingBoxModel
    distance_estimate: Optional[float] = None
    frame_seq: Optional[int] = None
    timestamp: Optional[str] = None

class SingleEvidenceModel(BaseModel):
    available: bool
    status: str  # POSITIVE, NEGATIVE, OFFLINE, STALE
    metric: Optional[str] = None
    confidence_score: Optional[float] = None
    detail: str

class FusionEvidenceChannelsModel(BaseModel):
    thermal: SingleEvidenceModel
    mmwave: SingleEvidenceModel
    camera_yolo: SingleEvidenceModel
    # Note: Gas sensor is strictly excluded from human-detection evidence channels!

class HumanDetectionFusionModel(BaseModel):
    state: str  # HUMAN_CONFIRMED, UNCERTAIN, NO_HUMAN_DETECTED, INSUFFICIENT_EVIDENCE
    overall_confidence: Optional[float] = None
    fusion_algorithm: str = "Tri-Modal Decision Matrix v2.1"
    last_detection_timestamp: Optional[str] = None
    evidence: FusionEvidenceChannelsModel
    status_reason: str

class TelemetryFrameModel(BaseModel):
    seq: int
    timestamp: str
    system: SystemStatusModel
    thermal: ThermalTelemetryModel
    mmwave: MmWaveTelemetryModel
    gas: GasTelemetryModel
    camera: CameraMetadataModel
    yolo_detections: List[YoloDetectionModel]
    human_detection_fusion: HumanDetectionFusionModel

class MissionEventModel(BaseModel):
    id: str
    time: str
    summary: str
    severity: str  # info, warning, critical

class MissionSensorSummaryModel(BaseModel):
    max_thermal_c: Optional[float] = 37.4
    min_thermal_c: Optional[float] = 18.2
    max_radar_distance_m: Optional[float] = 4.8
    peak_co_ppm: Optional[float] = 4.8
    air_hazard_summary: str = "Safe atmosphere (<9 ppm CO)"
    optical_detections_count: int = 4

class MissionModel(BaseModel):
    id: str
    code: str
    name: str
    date: str
    start_time: str
    end_time: Optional[str] = None
    status: str  # IN_PROGRESS, COMPLETED, ABORTED
    location: str
    survivors_found: int
    hazards_detected: str
    sensor_summary: Optional[MissionSensorSummaryModel] = None
    events: List[MissionEventModel] = Field(default_factory=list)

class CameraConfigModel(BaseModel):
    esp32_url: Optional[str] = None
    enable_yolo: bool = True
    simulate_zero_detections: bool = False
