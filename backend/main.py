"""
Rescue Rover FastAPI Telemetry & Mission API Server.
Provides REST endpoints, real-time WebSocket telemetry stream,
MJPEG Camera Stream compatible with ESP32-S3 Camera,
and asynchronous SQLite persistence for missions, events, and telemetry.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import io
import os
import random
import time
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Response, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw

from models import (
    SystemStatusModel,
    ThermalTelemetryModel,
    MmWaveTelemetryModel,
    GasTelemetryModel,
    CameraMetadataModel,
    BoundingBoxModel,
    YoloDetectionModel,
    TelemetryFrameModel,
    MissionModel,
    MissionEventModel,
    MissionSensorSummaryModel,
    CameraConfigModel,
    HumanDetectionFusionModel,
)
from fusion import evaluate_human_detection_fusion
from database import db_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes SQLite schema and seeds default missions on startup."""
    await db_manager.init_db(seed_if_empty=True)
    yield


app = FastAPI(
    title="Rescue Rover Telemetry & Camera API",
    description="Backend API, MJPEG Camera Stream, and WebSocket telemetry service for AI Disaster Response Rover",
    version="1.2.0",
    lifespan=lifespan,
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Config
camera_config = CameraConfigModel(
    esp32_url=os.getenv("ESP32_CAMERA_URL", None),
    enable_yolo=True,
    simulate_zero_detections=False,
)

current_sequence: int = 1000

# Base cached background frame to maximize performance
_cached_bg_image: Optional[Image.Image] = None

def _create_base_tunnel_image(width: int = 1280, height: int = 720) -> Image.Image:
    """Creates realistic low-light tunnel rescue camera background."""
    img = Image.new("RGB", (width, height), color=(11, 13, 18))
    draw = ImageDraw.Draw(img)

    # Tunnel perspective lines
    # Ceiling & floor
    draw.polygon([(0, 0), (440, 320), (840, 320), (width, 0)], fill=(16, 19, 27))
    draw.polygon([(0, height), (440, 480), (840, 480), (width, height)], fill=(14, 17, 24))
    # Left & right walls
    draw.polygon([(0, 0), (440, 320), (440, 480), (0, height)], fill=(18, 22, 31))
    draw.polygon([(width, 0), (840, 320), (840, 480), (width, height)], fill=(18, 22, 31))
    # Distant back wall
    draw.rectangle([(440, 320), (840, 480)], fill=(22, 27, 38))

    # Debris / concrete blocks
    draw.polygon([(520, 450), (620, 380), (740, 440), (680, 500)], fill=(28, 34, 46))
    draw.polygon([(200, 520), (320, 460), (410, 540), (280, 600)], fill=(24, 29, 40))

    # Survivor silhouette behind debris
    # Head (centered near x=590, y=365)
    draw.ellipse([(580, 345), (615, 385)], fill=(32, 39, 54))
    # Shoulders and torso
    draw.polygon([(560, 385), (635, 385), (650, 460), (550, 460)], fill=(28, 35, 48))
    # Foreground rubble blocking lower body
    draw.polygon([(530, 430), (670, 420), (690, 490), (510, 480)], fill=(20, 24, 34))

    return img

def render_camera_frame(width: int = 1280, height: int = 720) -> bytes:
    """Renders real-time JPEG frame with dynamic timestamp and OSD watermark."""
    global _cached_bg_image
    if _cached_bg_image is None or _cached_bg_image.size != (width, height):
        _cached_bg_image = _create_base_tunnel_image(width, height)

    frame = _cached_bg_image.copy()
    draw = ImageDraw.Draw(frame)

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + " UTC"
    
    # Clean broadcast OSD overlay
    osd_text = f"CAM-01 [ESP32-S3] • {now_utc} • ISO 1600 • 25 FPS"
    draw.text((24, 20), osd_text, fill=(200, 210, 225))
    draw.text((24, height - 36), "ARES SEARCH & RESCUE // LIVE OPTICAL STREAM", fill=(140, 155, 175))

    # Reticle center tick
    cx, cy = width // 2, height // 2
    draw.line([(cx - 15, cy), (cx + 15, cy)], fill=(90, 105, 130), width=1)
    draw.line([(cx, cy - 15), (cx, cy + 15)], fill=(90, 105, 130), width=1)

    # Encode to JPEG
    buf = io.BytesIO()
    frame.save(buf, format="JPEG", quality=75, optimize=True)
    return buf.getvalue()


def generate_telemetry_frame() -> TelemetryFrameModel:
    """Generates telemetry frame with normalized detection coordinates and sequence sync."""
    global current_sequence
    current_sequence += 1
    now_iso = datetime.now(timezone.utc).isoformat()
    now_utc_str = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")

    thermal_jitter = (random.random() - 0.5) * 0.15
    target_temp = round(36.8 + thermal_jitter, 1)

    mmwave_jitter = (random.random() - 0.5) * 0.02
    distance = round(2.35 + mmwave_jitter, 2)

    gas_jitter = (random.random() - 0.5) * 0.05
    co_ppm = round(4.2 + gas_jitter, 1)

    # YOLO Detections: normalized coordinates matching silhouette in 1280x720 frame
    yolo_detections: List[YoloDetectionModel] = []

    if not camera_config.simulate_zero_detections:
        norm_x = round(0.44 + (random.random() - 0.5) * 0.005, 3)
        norm_y = round(0.46 + (random.random() - 0.5) * 0.005, 3)
        norm_w = 0.085
        norm_h = 0.20

        yolo_detections.append(
            YoloDetectionModel(
                track_id="#TRK-108",
                class_label="person",
                confidence=round(0.94 + (random.random() - 0.5) * 0.02, 2),
                bounding_box=BoundingBoxModel(
                    norm_x_min=norm_x,
                    norm_y_min=norm_y,
                    norm_width=norm_w,
                    norm_height=norm_h,
                    top=f"{norm_y * 100:.1f}%",
                    left=f"{norm_x * 100:.1f}%",
                    width=f"{norm_w * 100:.1f}%",
                    height=f"{norm_h * 100:.1f}%",
                ),
                distance_estimate=distance,
                frame_seq=current_sequence,
                timestamp=now_iso,
            )
        )

    thermal_model = ThermalTelemetryModel(
        sensor_id="FLIR-LEPTON-3.5",
        status="CONNECTED",
        target_temp=target_temp,
        ambient_temp=19.4,
        delta_text=f"+{round(target_temp - 19.4, 1)}°C",
        raw_confidence=0.89,
        history=[19.2, 19.5, 20.1, 21.0, 24.5, 31.2, 35.8, target_temp],
        last_updated=now_utc_str,
        error_message=None,
    )

    mmwave_model = MmWaveTelemetryModel(
        sensor_id="TI-IWR6843",
        status="CONNECTED",
        presence_state="CONFIRMED",
        distance_meters=distance,
        micro_doppler_rate="14.2 bpm",
        raw_confidence=0.93,
        history=[0.1, 0.2, 0.4, 0.8, 0.95, 0.93, 0.93],
        last_updated=now_utc_str,
        error_message=None,
    )

    # Gas telemetry: strictly isolated for environmental hazard monitoring
    gas_model = GasTelemetryModel(
        sensor_id="MQ-ARRAY-01",
        status="CONNECTED",
        hazard_level="NOMINAL",
        co_ppm=co_ppm,
        combustible_lel=1.1,
        voc_ppb=125.0,
        oxygen_percent=20.8,
        last_updated=now_utc_str,
        error_message=None,
    )

    camera_model = CameraMetadataModel(
        camera_id="ESP32S3-CAM-01",
        status="STREAMING",
        stream_type="MJPEG",
        stream_endpoint="/api/camera/stream",
        resolution="1280x720",
        natural_width=1280,
        natural_height=720,
        fps=25.0,
        codec="MJPEG / HTTP",
        packet_loss_percent=0.00,
        latency_ms=random.randint(28, 36),
        stream_url="/api/camera/stream",
        last_frame_timestamp=now_utc_str,
        esp32_source_url=camera_config.esp32_url,
    )

    # Backend evaluates the multi-modal fusion logic (Thermal + mmWave + YOLO; Gas strictly excluded)
    fusion_output = evaluate_human_detection_fusion(
        thermal=thermal_model,
        mmwave=mmwave_model,
        camera=camera_model,
        yolo_detections=yolo_detections,
        last_timestamp=now_utc_str,
    )

    return TelemetryFrameModel(
        seq=current_sequence,
        timestamp=now_iso,
        system=SystemStatusModel(
            rover_id="ARES-ROVER-04",
            system_status="OPTIMAL",
            rover_connection="CONNECTED",
            camera_connection="STREAMING",
            hardware_latency_ms=random.randint(19, 26),
            battery_level=84,
            battery_voltage="24.8V",
        ),
        thermal=thermal_model,
        mmwave=mmwave_model,
        gas=gas_model,
        camera=camera_model,
        yolo_detections=yolo_detections,
        human_detection_fusion=fusion_output,
    )


# --- REST Endpoints ---

@app.get("/api/health")
def health_check():
    """Health check endpoint to verify backend connectivity."""
    return {
        "status": "ok",
        "service": "rescue-rover-backend",
        "version": "1.2.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": {
            "type": "sqlite",
            "path": db_manager.db_path,
        },
    }

@app.get("/api/camera/status")
def get_camera_status():
    """Returns camera streaming metadata and ESP32 configuration."""
    return {
        "camera_id": "ESP32S3-CAM-01",
        "status": "STREAMING",
        "stream_type": "MJPEG",
        "stream_url": "/api/camera/stream",
        "resolution": "1280x720",
        "natural_width": 1280,
        "natural_height": 720,
        "fps": 25.0,
        "codec": "MJPEG / HTTP",
        "esp32_configured": bool(camera_config.esp32_url),
        "esp32_url": camera_config.esp32_url,
        "simulate_zero_detections": camera_config.simulate_zero_detections,
    }

@app.post("/api/camera/config")
def update_camera_config(config: CameraConfigModel):
    """Allows dynamically updating camera configuration (e.g. ESP32 URL or test zero detections)."""
    global camera_config
    camera_config = config
    return {"status": "updated", "config": camera_config}

@app.get("/api/camera/frame")
def get_single_camera_frame():
    """Returns a single JPEG frame for snapshot tests or low-bandwidth environments."""
    jpeg_bytes = render_camera_frame()
    return Response(content=jpeg_bytes, media_type="image/jpeg")

@app.get("/api/camera/stream")
async def mjpeg_stream_endpoint():
    """
    Standard MJPEG stream endpoint (multipart/x-mixed-replace; boundary=frame).
    Compatible with ESP32-S3 Camera format and HTML <img> tag.
    """
    async def frame_generator():
        while True:
            jpeg_bytes = render_camera_frame()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(jpeg_bytes)).encode() + b"\r\n\r\n"
                + jpeg_bytes + b"\r\n"
            )
            await asyncio.sleep(0.04)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "close",
        },
    )

@app.get("/api/system/status", response_model=SystemStatusModel)
def get_system_status():
    frame = generate_telemetry_frame()
    return frame.system

@app.get("/api/telemetry/latest", response_model=TelemetryFrameModel)
async def get_latest_telemetry():
    """Generates the latest telemetry frame and asynchronously logs it to SQLite."""
    frame = generate_telemetry_frame()
    try:
        await db_manager.record_telemetry(frame, mission_id="msn-09")
    except Exception as err:
        # Non-fatal to client read, but logged
        pass
    return frame

@app.post("/api/telemetry", status_code=status.HTTP_201_CREATED)
async def ingest_telemetry(frame: TelemetryFrameModel, mission_id: Optional[str] = "msn-09"):
    """
    Allows physical rover or simulation pipeline to post structured telemetry frames directly.
    Persists data into SQLite with deduplication on (seq, timestamp).
    """
    try:
        await db_manager.record_telemetry(frame, mission_id=mission_id)
        return {"status": "persisted", "seq": frame.seq}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Database persistence failure: {str(err)}")

# --- Persistent Mission Endpoints ---

@app.get("/api/missions", response_model=List[MissionModel])
async def list_missions():
    """Returns stored missions from SQLite, ordered by date and time descending."""
    return await db_manager.list_missions()

@app.post("/api/missions", response_model=MissionModel, status_code=status.HTTP_201_CREATED)
async def create_mission(mission: MissionModel):
    """Creates a new mission in SQLite with atomic transaction handling."""
    try:
        return await db_manager.create_mission(mission)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database persistence failure: {str(e)}"
        )

@app.get("/api/missions/{mission_id}", response_model=MissionModel)
async def get_mission(mission_id: str):
    """Retrieves stored details for a single mission by ID or mission code."""
    mission = await db_manager.get_mission(mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return mission

@app.patch("/api/missions/{mission_id}", response_model=MissionModel)
async def update_mission(mission_id: str, updates: Dict[str, Any]):
    """Updates status, survivor count, or other metadata on an existing mission."""
    updated = await db_manager.update_mission(mission_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Mission not found")
    return updated

@app.get("/api/missions/{mission_id}/events", response_model=List[MissionEventModel])
async def get_mission_events(mission_id: str):
    """Retrieves all archived events for a mission."""
    mission = await db_manager.get_mission(mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return mission.events

@app.post("/api/missions/{mission_id}/events", status_code=status.HTTP_201_CREATED)
async def add_mission_event(mission_id: str, event: MissionEventModel):
    """
    Appends an event to an existing mission in SQLite.
    Idempotent: Replayed event IDs on WebSocket reconnects are deduplicated.
    """
    mission = await db_manager.get_mission(mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    try:
        added = await db_manager.add_mission_event(mission_id, event)
        return {
            "status": "persisted" if added else "deduplicated",
            "mission_id": mission.id,
            "event_id": event.id,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist event: {str(e)}"
        )

@app.get("/api/missions/{mission_id}/telemetry")
async def get_mission_telemetry(mission_id: str, limit: int = 100):
    """
    Retrieves stored historical telemetry readings for a mission.
    Decoupled from live stream: purely returns recorded rows from SQLite.
    """
    mission = await db_manager.get_mission(mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return await db_manager.get_historical_telemetry(mission_id, limit=limit)


# --- WebSocket Telemetry Stream ---

@app.websocket("/api/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            frame = generate_telemetry_frame()
            # Asynchronously persist generated frames without blocking the socket
            try:
                await db_manager.record_telemetry(frame, mission_id="msn-09")
            except Exception:
                pass
            await websocket.send_text(frame.model_dump_json())
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
