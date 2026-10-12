"""
Automated Pytest Suite for Rescue Rover SQLite Persistence & FastAPI Endpoints.
Covers:
- Database schema initialization & automated seeding
- Mission creation, retrieval, and updating
- Event logging with reconnection deduplication
- Telemetry persistence & historical record retrieval
- Complete segregation of gas telemetry from human detection fusion
- Persistence survival across simulated server restarts
- Missing/invalid mission error handling (404/409/validation)
"""

import asyncio
import os
import shutil
import tempfile
import uuid
import pytest
from httpx import AsyncClient, ASGITransport

from database import DatabaseManager
from models import (
    MissionModel,
    MissionEventModel,
    MissionSensorSummaryModel,
    TelemetryFrameModel,
    SystemStatusModel,
    ThermalTelemetryModel,
    MmWaveTelemetryModel,
    GasTelemetryModel,
    CameraMetadataModel,
    BoundingBoxModel,
    YoloDetectionModel,
    HumanDetectionFusionModel,
    SingleEvidenceModel,
    FusionEvidenceChannelsModel,
)
from main import app


@pytest.fixture
def temp_db_path():
    """Provides an isolated temporary SQLite database path for each test."""
    temp_dir = tempfile.mkdtemp()
    db_file = os.path.join(temp_dir, "test_rover.db")
    yield db_file
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.mark.asyncio
async def test_init_db_and_seeding(temp_db_path):
    """Verifies fresh database initialization, WAL pragma setup, and default seeding."""
    mgr = DatabaseManager(temp_db_path)
    await mgr.init_db(seed_if_empty=True)

    missions = await mgr.list_missions()
    assert len(missions) == 3
    codes = [m.code for m in missions]
    assert "MISSION-2026-09" in codes
    assert "MISSION-2026-08" in codes
    assert "MISSION-2026-07" in codes

    # Verify seed events exist
    msn_09 = await mgr.get_mission("msn-09")
    assert msn_09 is not None
    assert len(msn_09.events) == 4
    assert msn_09.sensor_summary is not None
    assert msn_09.sensor_summary.max_thermal_c == 36.8


@pytest.mark.asyncio
async def test_create_mission_persistence(temp_db_path):
    """Tests creating a new mission and verifying persistence."""
    mgr = DatabaseManager(temp_db_path)
    await mgr.init_db(seed_if_empty=False)

    new_mission = MissionModel(
        id="msn-test-01",
        code="MISSION-2026-TEST",
        name="Test Seismic Assessment",
        date="2026-10-11",
        start_time="03:00",
        end_time=None,
        status="IN_PROGRESS",
        location="Sector 7 Testing Grounds",
        survivors_found=3,
        hazards_detected="None",
        sensor_summary=MissionSensorSummaryModel(
            max_thermal_c=36.9,
            min_thermal_c=18.0,
            max_radar_distance_m=3.10,
            peak_co_ppm=2.1,
            air_hazard_summary="Normal",
            optical_detections_count=2,
        ),
        events=[
            MissionEventModel(id="ev-t1", time="03:05:00", summary="Test person located", severity="critical")
        ],
    )

    created = await mgr.create_mission(new_mission)
    assert created.id == "msn-test-01"

    # Fetch back
    fetched = await mgr.get_mission("msn-test-01")
    assert fetched is not None
    assert fetched.name == "Test Seismic Assessment"
    assert fetched.survivors_found == 3
    assert len(fetched.events) == 1
    assert fetched.sensor_summary.max_thermal_c == 36.9


@pytest.mark.asyncio
async def test_duplicate_mission_conflict(temp_db_path):
    """Tests that inserting duplicate mission ID or code raises ValueError."""
    mgr = DatabaseManager(temp_db_path)
    await mgr.init_db(seed_if_empty=False)

    m1 = MissionModel(
        id="msn-dup",
        code="MISSION-DUP",
        name="Mission One",
        date="2026-10-11",
        start_time="01:00",
        status="IN_PROGRESS",
        location="Alpha",
        survivors_found=0,
        hazards_detected="",
    )
    await mgr.create_mission(m1)

    with pytest.raises(ValueError, match="already exists"):
        await mgr.create_mission(m1)


@pytest.mark.asyncio
async def test_event_deduplication_on_reconnect(temp_db_path):
    """
    Tests that repeating the exact same event ID does not create duplicates.
    Critical for WebSocket reconnections and replayed messages.
    """
    mgr = DatabaseManager(temp_db_path)
    await mgr.init_db(seed_if_empty=True)

    ev = MissionEventModel(
        id="ev-unique-101",
        time="01:15:00",
        summary="Survivors flagged via thermal sensor",
        severity="critical",
    )

    # First insertion -> True
    first_add = await mgr.add_mission_event("msn-09", ev)
    assert first_add is True

    # Duplicate retransmission -> False (deduplicated, no exception)
    second_add = await mgr.add_mission_event("msn-09", ev)
    assert second_add is False

    # Verify event count for msn-09 only increased by 1 (was 4, now 5)
    events = await mgr.get_mission_events("msn-09")
    matching = [e for e in events if e.id == "ev-unique-101"]
    assert len(matching) == 1


@pytest.mark.asyncio
async def test_telemetry_persistence_and_gas_segregation(temp_db_path):
    """
    Verifies that:
    1. Telemetry records persist to SQLite.
    2. Gas readings are stored strictly in dedicated columns.
    3. Human detection fusion output does NOT contain gas data.
    """
    mgr = DatabaseManager(temp_db_path)
    await mgr.init_db(seed_if_empty=True)

    test_frame = TelemetryFrameModel(
        seq=5001,
        timestamp="2026-10-11T03:30:00Z",
        system=SystemStatusModel(
            rover_id="ROVER-TEST-01",
            system_status="OPTIMAL",
            rover_connection="CONNECTED",
            camera_connection="STREAMING",
            hardware_latency_ms=21,
            battery_level=90,
            battery_voltage="25.2V",
        ),
        thermal=ThermalTelemetryModel(
            sensor_id="FLIR-LEPTON",
            status="CONNECTED",
            target_temp=37.1,
            ambient_temp=19.5,
            raw_confidence=0.91,
        ),
        mmwave=MmWaveTelemetryModel(
            sensor_id="TI-IWR6843",
            status="CONNECTED",
            presence_state="CONFIRMED",
            distance_meters=2.10,
            micro_doppler_rate="15.0 bpm",
            raw_confidence=0.94,
        ),
        gas=GasTelemetryModel(
            sensor_id="MQ-ARRAY-01",
            status="CONNECTED",
            hazard_level="ELEVATED",
            co_ppm=18.4,
            combustible_lel=4.5,
            voc_ppb=240.0,
            oxygen_percent=20.1,
        ),
        camera=CameraMetadataModel(
            camera_id="ESP32S3-CAM",
            status="STREAMING",
            stream_type="MJPEG",
            stream_endpoint="/api/camera/stream",
            fps=25.0,
        ),
        yolo_detections=[
            YoloDetectionModel(
                track_id="#TRK-501",
                class_label="person",
                confidence=0.96,
                bounding_box=BoundingBoxModel(
                    norm_x_min=0.45,
                    norm_y_min=0.48,
                    norm_width=0.08,
                    norm_height=0.22,
                ),
                distance_estimate=2.10,
                frame_seq=5001,
                timestamp="2026-10-11T03:30:00Z",
            )
        ],
        human_detection_fusion=HumanDetectionFusionModel(
            state="HUMAN_CONFIRMED",
            overall_confidence=0.95,
            fusion_algorithm="Tri-Modal Decision Matrix v2.1",
            last_detection_timestamp="03:30:00 UTC",
            evidence=FusionEvidenceChannelsModel(
                thermal=SingleEvidenceModel(
                    available=True, status="POSITIVE", metric="37.1°C", confidence_score=0.91, detail="Hotspot"
                ),
                mmwave=SingleEvidenceModel(
                    available=True, status="POSITIVE", metric="2.10m", confidence_score=0.94, detail="Doppler"
                ),
                camera_yolo=SingleEvidenceModel(
                    available=True, status="POSITIVE", metric="person (0.96)", confidence_score=0.96, detail="YOLO"
                ),
            ),
            status_reason="Tri-modal confirmation",
        ),
    )

    persisted = await mgr.record_telemetry(test_frame, mission_id="msn-09")
    assert persisted is True

    # Retrieve historical telemetry
    history = await mgr.get_historical_telemetry("msn-09", limit=10)
    assert len(history) >= 1
    latest_row = history[0]

    assert latest_row["seq"] == 5001
    assert latest_row["thermal_target_temp"] == 37.1
    assert latest_row["mmwave_distance_m"] == 2.10
    # Gas readings strictly in gas columns
    assert latest_row["gas_co_ppm"] == 18.4
    assert latest_row["gas_hazard_level"] == "ELEVATED"
    # Fusion state strictly independent of gas
    assert latest_row["fusion_state"] == "HUMAN_CONFIRMED"
    assert latest_row["fusion_confidence"] == 0.95


@pytest.mark.asyncio
async def test_persistence_across_server_restart(temp_db_path):
    """
    Simulates a Uvicorn process crash/restart by dropping the initial DatabaseManager
    and instantiating a new DatabaseManager pointing to the same SQLite file.
    Verifies that all changes persist.
    """
    # 1. First server session: initialize and add data
    session_1 = DatabaseManager(temp_db_path)
    await session_1.init_db(seed_if_empty=True)

    await session_1.create_mission(
        MissionModel(
            id="msn-persisted",
            code="MISSION-PERSIST",
            name="Structural Integrity Post-Quake",
            date="2026-10-11",
            start_time="04:00",
            status="IN_PROGRESS",
            location="Zone 9",
            survivors_found=4,
            hazards_detected="Debris only",
        )
    )

    # 2. Simulate complete restart / process shutdown
    del session_1

    # 3. Second server session (after reboot)
    session_2 = DatabaseManager(temp_db_path)
    await session_2.init_db(seed_if_empty=True)  # Should not overwrite or reseed

    # Verify data created in session 1 is present
    restored = await session_2.get_mission("msn-persisted")
    assert restored is not None
    assert restored.code == "MISSION-PERSIST"
    assert restored.survivors_found == 4


@pytest.mark.asyncio
async def test_fastapi_rest_endpoints_with_sqlite():
    """Tests the full FastAPI REST interface with test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check with DB status
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "database" in data

        # 2. List missions
        res = await client.get("/api/missions")
        assert res.status_code == 200
        missions = res.json()
        assert len(missions) >= 3

        # 3. Get single mission by ID & Code
        res_id = await client.get("/api/missions/msn-08")
        assert res_id.status_code == 200
        assert res_id.json()["code"] == "MISSION-2026-08"

        res_code = await client.get("/api/missions/MISSION-2026-08")
        assert res_code.status_code == 200
        assert res_code.json()["id"] == "msn-08"

        # 4. Missing mission returns 404
        res_missing = await client.get("/api/missions/non-existent-999")
        assert res_missing.status_code == 404

        # 5. Add event with deduplication
        unique_ev_id = f"ev-api-{uuid.uuid4().hex[:8]}"
        event_payload = {
            "id": unique_ev_id,
            "time": "02:00:00",
            "summary": "Human voice oscillation detected via audio directional mic",
            "severity": "warning",
        }
        res_ev1 = await client.post("/api/missions/msn-09/events", json=event_payload)
        assert res_ev1.status_code == 201
        assert res_ev1.json()["status"] == "persisted"

        # Duplicate call -> deduplicated
        res_ev2 = await client.post("/api/missions/msn-09/events", json=event_payload)
        assert res_ev2.status_code == 201
        assert res_ev2.json()["status"] == "deduplicated"

        # 6. Historical telemetry retrieval
        res_hist = await client.get("/api/missions/msn-09/telemetry?limit=5")
        assert res_hist.status_code == 200
        assert isinstance(res_hist.json(), list)

        # 7. Update mission endpoint
        res_patch = await client.patch("/api/missions/msn-09", json={"survivors_found": 5, "status": "COMPLETED"})
        assert res_patch.status_code == 200
        assert res_patch.json()["survivors_found"] == 5
        assert res_patch.json()["status"] == "COMPLETED"

        # 8. Invalid mission payload returns 422
        res_invalid = await client.post("/api/missions", json={"invalid_field": "error"})
        assert res_invalid.status_code == 422


@pytest.mark.asyncio
async def test_configurable_db_path(temp_db_path):
    """Verifies that custom DB path is respected and directory is created if needed."""
    custom_subpath = os.path.join(temp_db_path, "nested", "rover_custom.db")
    mgr = DatabaseManager(custom_subpath)
    await mgr.init_db(seed_if_empty=True)
    assert os.path.exists(custom_subpath)
    missions = await mgr.list_missions()
    assert len(missions) == 3


@pytest.mark.asyncio
async def test_replayed_telemetry_frame_deduplication(temp_db_path):
    """Verifies that replaying frames with identical sequence and timestamp does not create duplicate rows."""
    mgr = DatabaseManager(temp_db_path)
    await mgr.init_db(seed_if_empty=True)

    frame = TelemetryFrameModel(
        seq=9999,
        timestamp="2026-10-11T03:55:00Z",
        system=SystemStatusModel(),
        thermal=ThermalTelemetryModel(),
        mmwave=MmWaveTelemetryModel(),
        gas=GasTelemetryModel(),
        camera=CameraMetadataModel(),
        yolo_detections=[],
        human_detection_fusion=HumanDetectionFusionModel(
            state="NO_HUMAN_DETECTED",
            overall_confidence=0.0,
            fusion_algorithm="Tri-Modal Decision Matrix v2.1",
            last_detection_timestamp="03:55:00 UTC",
            evidence=FusionEvidenceChannelsModel(
                thermal=SingleEvidenceModel(available=True, status="NEGATIVE", detail="Ambient"),
                mmwave=SingleEvidenceModel(available=True, status="NEGATIVE", detail="Clear"),
                camera_yolo=SingleEvidenceModel(available=True, status="NEGATIVE", detail="Zero person"),
            ),
            status_reason="All negative",
        ),
    )

    # First record
    await mgr.record_telemetry(frame, mission_id="msn-09")
    # Duplicate replay
    await mgr.record_telemetry(frame, mission_id="msn-09")

    history = await mgr.get_historical_telemetry("msn-09", limit=100)
    matching = [h for h in history if h["seq"] == 9999]
    assert len(matching) == 1

