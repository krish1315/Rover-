"""
SQLite Database Layer for Rescue Rover.
Provides asynchronous, transaction-safe SQLite persistence for:
- Missions and deployment metadata
- Sensor summaries and peak metrics
- Mission events (with idempotent deduplication on reconnection)
- Real-time and historical sensor telemetry records
- YOLO detection logs (with frame/track deduplication)

Uses aiosqlite with WAL mode and serialized write transactions to prevent server blocking.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from typing import List, Optional, Dict, Any

import aiosqlite

from models import (
    MissionModel,
    MissionEventModel,
    MissionSensorSummaryModel,
    TelemetryFrameModel,
    YoloDetectionModel,
)

logger = logging.getLogger("rover.database")

# Default DB Path: can be overridden via ROVER_DB_PATH environment variable
DEFAULT_DB_PATH = os.path.abspath(
    os.getenv("ROVER_DB_PATH", os.path.join(os.path.dirname(__file__), "rover.db"))
)

# Seed mission dataset to populate fresh databases seamlessly
SEED_MISSIONS: List[MissionModel] = [
    MissionModel(
        id="msn-09",
        code="MISSION-2026-09",
        name="Sector 4 Collapse Search",
        date="2026-10-10",
        start_time="22:15",
        end_time=None,
        status="IN_PROGRESS",
        location="Metro Transit Tunnel Shaft B",
        survivors_found=1,
        hazards_detected="Moderate structural dust, stable CO",
        sensor_summary=MissionSensorSummaryModel(
            max_thermal_c=36.8,
            min_thermal_c=19.2,
            max_radar_distance_m=2.45,
            peak_co_ppm=4.2,
            air_hazard_summary="Safe atmospheric respiration (<9 ppm CO)",
            optical_detections_count=3,
        ),
        events=[
            MissionEventModel(id="ev-1", time="23:46:12", summary="Human verified: Thermal 36.8°C + mmWave 2.35m + YOLO 94%", severity="critical"),
            MissionEventModel(id="ev-2", time="23:45:50", summary="Micro-Doppler chest oscillation detected at 2.4m", severity="warning"),
            MissionEventModel(id="ev-3", time="23:45:18", summary="Elevated thermal signature (35.4°C) identified in quadrant B", severity="warning"),
            MissionEventModel(id="ev-4", time="23:44:02", summary="CO levels nominal (4.2 ppm) - Sector safe for human respiration", severity="info"),
        ],
    ),
    MissionModel(
        id="msn-08",
        code="MISSION-2026-08",
        name="Alpine Warehouse Seismic Audit",
        date="2026-10-09",
        start_time="14:20",
        end_time="16:45",
        status="COMPLETED",
        location="Industrial District Sub-level 1",
        survivors_found=2,
        hazards_detected="Elevated methane (12% LEL)",
        sensor_summary=MissionSensorSummaryModel(
            max_thermal_c=37.2,
            min_thermal_c=17.5,
            max_radar_distance_m=3.80,
            peak_co_ppm=8.5,
            air_hazard_summary="Elevated methane detected (12% LEL); ventilation required",
            optical_detections_count=5,
        ),
        events=[
            MissionEventModel(id="ev-8-1", time="16:40:00", summary="2 survivors extracted via Rescue Squad Alpha", severity="critical"),
            MissionEventModel(id="ev-8-2", time="15:10:00", summary="Thermal hotspot confirmed behind collapsed drywall", severity="warning"),
            MissionEventModel(id="ev-8-3", time="14:35:00", summary="Combustible gas warning flagged in sub-level corridor", severity="warning"),
        ],
    ),
    MissionModel(
        id="msn-07",
        code="MISSION-2026-07",
        name="Quarry Landslide Void Exploration",
        date="2026-10-07",
        start_time="08:10",
        end_time="11:30",
        status="COMPLETED",
        location="North Basin Extraction Site",
        survivors_found=0,
        hazards_detected="Unstable rock pile, 0 ppm gas",
        sensor_summary=MissionSensorSummaryModel(
            max_thermal_c=24.1,
            min_thermal_c=12.0,
            max_radar_distance_m=6.50,
            peak_co_ppm=1.2,
            air_hazard_summary="Atmosphere clear; physical rockfall instability",
            optical_detections_count=0,
        ),
        events=[
            MissionEventModel(id="ev-7-1", time="11:20:00", summary="Sector fully cleared; void search complete (0 casualties)", severity="info"),
            MissionEventModel(id="ev-7-2", time="09:40:00", summary="Radar scan through rubble cavity returned negative motion", severity="info"),
        ],
    ),
]


class DatabaseManager:
    """Manages SQLite operations using aiosqlite and async connection locking."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        self._lock = asyncio.Lock()
        self._initialized = False

    async def _ensure_initialized(self) -> None:
        """Guarantees schema is initialized before any read/write operation."""
        if not self._initialized:
            await self.init_db(seed_if_empty=True)

    async def init_db(self, seed_if_empty: bool = True) -> None:
        """Initializes database schema with WAL mode and foreign key support."""
        # Ensure parent directory exists
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("PRAGMA journal_mode = WAL;")
                await db.execute("PRAGMA synchronous = NORMAL;")
                await db.execute("PRAGMA foreign_keys = ON;")

                # Table 1: Missions
                await db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS missions (
                        id TEXT PRIMARY KEY,
                        code TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        date TEXT NOT NULL,
                        start_time TEXT NOT NULL,
                        end_time TEXT,
                        status TEXT NOT NULL,
                        location TEXT NOT NULL,
                        survivors_found INTEGER NOT NULL DEFAULT 0,
                        hazards_detected TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    """
                )

                # Table 2: Mission Sensor Summaries (1-to-1 with missions)
                await db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS mission_sensor_summaries (
                        mission_id TEXT PRIMARY KEY,
                        max_thermal_c REAL,
                        min_thermal_c REAL,
                        max_radar_distance_m REAL,
                        peak_co_ppm REAL,
                        air_hazard_summary TEXT,
                        optical_detections_count INTEGER DEFAULT 0,
                        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
                    );
                    """
                )

                # Table 3: Mission Events (idempotent composite primary key)
                await db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS mission_events (
                        id TEXT NOT NULL,
                        mission_id TEXT NOT NULL,
                        time TEXT NOT NULL,
                        summary TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        PRIMARY KEY (mission_id, id),
                        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
                    );
                    """
                )

                # Table 4: Telemetry Records (Time series telemetry data)
                await db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS telemetry_records (
                        seq INTEGER NOT NULL,
                        timestamp TEXT NOT NULL,
                        mission_id TEXT,
                        rover_id TEXT NOT NULL,
                        system_status TEXT NOT NULL,
                        rover_connection TEXT NOT NULL,
                        hardware_latency_ms INTEGER,
                        battery_level INTEGER,
                        battery_voltage TEXT,
                        thermal_target_temp REAL,
                        thermal_ambient_temp REAL,
                        thermal_status TEXT,
                        thermal_raw_confidence REAL,
                        mmwave_presence_state TEXT,
                        mmwave_distance_m REAL,
                        mmwave_micro_doppler TEXT,
                        mmwave_status TEXT,
                        mmwave_raw_confidence REAL,
                        gas_status TEXT,
                        gas_hazard_level TEXT,
                        gas_co_ppm REAL,
                        gas_combustible_lel REAL,
                        gas_voc_ppb REAL,
                        gas_oxygen_pct REAL,
                        camera_status TEXT,
                        camera_fps REAL,
                        fusion_state TEXT,
                        fusion_confidence REAL,
                        fusion_algorithm TEXT,
                        fusion_reason TEXT,
                        raw_json TEXT,
                        PRIMARY KEY (seq, timestamp)
                    );
                    """
                )

                # Table 5: YOLO Detections (Unique track ID per frame sequence)
                await db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS yolo_detections (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        telemetry_seq INTEGER NOT NULL,
                        mission_id TEXT,
                        track_id TEXT NOT NULL,
                        class_label TEXT NOT NULL,
                        confidence REAL NOT NULL,
                        norm_x_min REAL NOT NULL,
                        norm_y_min REAL NOT NULL,
                        norm_width REAL NOT NULL,
                        norm_height REAL NOT NULL,
                        distance_estimate REAL,
                        timestamp TEXT NOT NULL,
                        UNIQUE (telemetry_seq, track_id)
                    );
                    """
                )

                # Performance Indexes
                await db.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_mission ON telemetry_records(mission_id);")
                await db.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_records(timestamp);")
                await db.execute("CREATE INDEX IF NOT EXISTS idx_events_mission ON mission_events(mission_id);")
                await db.execute("CREATE INDEX IF NOT EXISTS idx_yolo_seq ON yolo_detections(telemetry_seq);")

                await db.commit()

                # Seed default missions if the database is newly initialized
                if seed_if_empty:
                    async with db.execute("SELECT COUNT(*) FROM missions;") as cursor:
                        row = await cursor.fetchone()
                        count = row[0] if row else 0

                    if count == 0:
                        logger.info("Database missions table empty; seeding default missions...")
                        for m in SEED_MISSIONS:
                            await self._insert_mission_unlocked(db, m)
                        await db.commit()

            self._initialized = True

    async def _insert_mission_unlocked(self, db: aiosqlite.Connection, mission: MissionModel) -> None:
        """Internal helper to insert a mission and its children within an active transaction."""
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """
            INSERT OR REPLACE INTO missions (
                id, code, name, date, start_time, end_time, status, location,
                survivors_found, hazards_detected, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                mission.id,
                mission.code,
                mission.name,
                mission.date,
                mission.start_time,
                mission.end_time,
                mission.status,
                mission.location,
                mission.survivors_found,
                mission.hazards_detected,
                now_iso,
                now_iso,
            ),
        )

        if mission.sensor_summary:
            await db.execute(
                """
                INSERT OR REPLACE INTO mission_sensor_summaries (
                    mission_id, max_thermal_c, min_thermal_c, max_radar_distance_m,
                    peak_co_ppm, air_hazard_summary, optical_detections_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    mission.id,
                    mission.sensor_summary.max_thermal_c,
                    mission.sensor_summary.min_thermal_c,
                    mission.sensor_summary.max_radar_distance_m,
                    mission.sensor_summary.peak_co_ppm,
                    mission.sensor_summary.air_hazard_summary,
                    mission.sensor_summary.optical_detections_count,
                ),
            )

        if mission.events:
            for ev in mission.events:
                await db.execute(
                    """
                    INSERT OR IGNORE INTO mission_events (
                        id, mission_id, time, summary, severity, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (ev.id, mission.id, ev.time, ev.summary, ev.severity, now_iso),
                )

    async def list_missions(self) -> List[MissionModel]:
        """Retrieves all missions ordered by start date/time descending."""
        await self._ensure_initialized()
        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    """
                    SELECT m.*, s.max_thermal_c, s.min_thermal_c, s.max_radar_distance_m,
                           s.peak_co_ppm, s.air_hazard_summary, s.optical_detections_count
                    FROM missions m
                    LEFT JOIN mission_sensor_summaries s ON m.id = s.mission_id
                    ORDER BY m.date DESC, m.start_time DESC;
                    """
                ) as cursor:
                    mission_rows = await cursor.fetchall()

                missions: List[MissionModel] = []
                for row in mission_rows:
                    m_id = row["id"]
                    # Fetch events for this mission
                    async with db.execute(
                        "SELECT id, time, summary, severity FROM mission_events WHERE mission_id = ? ORDER BY rowid ASC;",
                        (m_id,),
                    ) as ev_cursor:
                        ev_rows = await ev_cursor.fetchall()

                    events = [
                        MissionEventModel(
                            id=ev["id"],
                            time=ev["time"],
                            summary=ev["summary"],
                            severity=ev["severity"],
                        )
                        for ev in ev_rows
                    ]

                    summary = None
                    if row["max_thermal_c"] is not None or row["air_hazard_summary"] is not None:
                        summary = MissionSensorSummaryModel(
                            max_thermal_c=row["max_thermal_c"],
                            min_thermal_c=row["min_thermal_c"],
                            max_radar_distance_m=row["max_radar_distance_m"],
                            peak_co_ppm=row["peak_co_ppm"],
                            air_hazard_summary=row["air_hazard_summary"] or "Atmosphere nominal",
                            optical_detections_count=row["optical_detections_count"] or 0,
                        )

                    missions.append(
                        MissionModel(
                            id=row["id"],
                            code=row["code"],
                            name=row["name"],
                            date=row["date"],
                            start_time=row["start_time"],
                            end_time=row["end_time"],
                            status=row["status"],
                            location=row["location"],
                            survivors_found=row["survivors_found"],
                            hazards_detected=row["hazards_detected"],
                            sensor_summary=summary,
                            events=events,
                        )
                    )
                return missions

    async def get_mission(self, mission_id_or_code: str) -> Optional[MissionModel]:
        """Retrieves a single mission by its ID or mission code."""
        await self._ensure_initialized()
        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    """
                    SELECT m.*, s.max_thermal_c, s.min_thermal_c, s.max_radar_distance_m,
                           s.peak_co_ppm, s.air_hazard_summary, s.optical_detections_count
                    FROM missions m
                    LEFT JOIN mission_sensor_summaries s ON m.id = s.mission_id
                    WHERE m.id = ? OR m.code = ?
                    LIMIT 1;
                    """,
                    (mission_id_or_code, mission_id_or_code),
                ) as cursor:
                    row = await cursor.fetchone()

                if not row:
                    return None

                m_id = row["id"]
                async with db.execute(
                    "SELECT id, time, summary, severity FROM mission_events WHERE mission_id = ? ORDER BY rowid ASC;",
                    (m_id,),
                ) as ev_cursor:
                    ev_rows = await ev_cursor.fetchall()

                events = [
                    MissionEventModel(
                        id=ev["id"],
                        time=ev["time"],
                        summary=ev["summary"],
                        severity=ev["severity"],
                    )
                    for ev in ev_rows
                ]

                summary = None
                if row["max_thermal_c"] is not None or row["air_hazard_summary"] is not None:
                    summary = MissionSensorSummaryModel(
                        max_thermal_c=row["max_thermal_c"],
                        min_thermal_c=row["min_thermal_c"],
                        max_radar_distance_m=row["max_radar_distance_m"],
                        peak_co_ppm=row["peak_co_ppm"],
                        air_hazard_summary=row["air_hazard_summary"] or "Atmosphere nominal",
                        optical_detections_count=row["optical_detections_count"] or 0,
                    )

                return MissionModel(
                    id=row["id"],
                    code=row["code"],
                    name=row["name"],
                    date=row["date"],
                    start_time=row["start_time"],
                    end_time=row["end_time"],
                    status=row["status"],
                    location=row["location"],
                    survivors_found=row["survivors_found"],
                    hazards_detected=row["hazards_detected"],
                    sensor_summary=summary,
                    events=events,
                )

    async def create_mission(self, mission: MissionModel) -> MissionModel:
        """Creates a new mission in SQLite with atomic transaction handling."""
        await self._ensure_initialized()
        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("PRAGMA foreign_keys = ON;")
                # Check for duplicate id or code
                async with db.execute(
                    "SELECT id FROM missions WHERE id = ? OR code = ?;",
                    (mission.id, mission.code),
                ) as cursor:
                    existing = await cursor.fetchone()
                    if existing:
                        raise ValueError(f"Mission with id '{mission.id}' or code '{mission.code}' already exists.")

                await self._insert_mission_unlocked(db, mission)
                await db.commit()

        return mission

    async def update_mission(self, mission_id: str, updates: Dict[str, Any]) -> Optional[MissionModel]:
        """Updates metadata on an existing mission (e.g. status, survivors_found, end_time)."""
        await self._ensure_initialized()
        allowed_fields = {
            "name", "status", "end_time", "location", "survivors_found", "hazards_detected"
        }
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}
        if not filtered_updates:
            return await self.get_mission(mission_id)

        now_iso = datetime.now(timezone.utc).isoformat()
        filtered_updates["updated_at"] = now_iso

        set_clauses = [f"{k} = ?" for k in filtered_updates.keys()]
        values = list(filtered_updates.values())
        values.append(mission_id)

        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(
                    f"UPDATE missions SET {', '.join(set_clauses)} WHERE id = ? OR code = ?;",
                    values + [mission_id],
                )
                if cursor.rowcount == 0:
                    return None
                await db.commit()

        return await self.get_mission(mission_id)

    async def add_mission_event(self, mission_id_or_code: str, event: MissionEventModel) -> bool:
        """
        Adds an event to a mission.
        Idempotent: Uses INSERT OR IGNORE on (mission_id, id) to prevent duplicate event creation
        when WebSocket streams reconnect or retransmit messages.
        """
        await self._ensure_initialized()
        now_iso = datetime.now(timezone.utc).isoformat()
        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute("PRAGMA foreign_keys = ON;")
                # Resolve actual mission ID if code was passed
                async with db.execute(
                    "SELECT id FROM missions WHERE id = ? OR code = ?;",
                    (mission_id_or_code, mission_id_or_code),
                ) as cursor:
                    row = await cursor.fetchone()
                    if not row:
                        return False
                    actual_id = row[0]

                cursor = await db.execute(
                    """
                    INSERT OR IGNORE INTO mission_events (
                        id, mission_id, time, summary, severity, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (event.id, actual_id, event.time, event.summary, event.severity, now_iso),
                )
                await db.commit()
                return cursor.rowcount > 0

    async def get_mission_events(self, mission_id_or_code: str) -> List[MissionEventModel]:
        """Retrieves all logged events for a mission."""
        mission = await self.get_mission(mission_id_or_code)
        if not mission:
            return []
        return mission.events

    async def record_telemetry(
        self, frame: TelemetryFrameModel, mission_id: Optional[str] = "msn-09"
    ) -> bool:
        """
        Persists a telemetry frame and its YOLO detections into SQLite.
        Transactions ensure atomicity, and INSERT OR IGNORE deduplicates on (seq, timestamp).
        Note: Gas sensor readings are stored strictly in their own dedicated columns and
        are never written to or mingled with human detection fusion columns.
        """
        await self._ensure_initialized()
        raw_json_str = frame.model_dump_json()

        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                # 1. Insert Telemetry Record
                await db.execute(
                    """
                    INSERT OR IGNORE INTO telemetry_records (
                        seq, timestamp, mission_id, rover_id, system_status,
                        rover_connection, hardware_latency_ms, battery_level, battery_voltage,
                        thermal_target_temp, thermal_ambient_temp, thermal_status, thermal_raw_confidence,
                        mmwave_presence_state, mmwave_distance_m, mmwave_micro_doppler, mmwave_status, mmwave_raw_confidence,
                        gas_status, gas_hazard_level, gas_co_ppm, gas_combustible_lel, gas_voc_ppb, gas_oxygen_pct,
                        camera_status, camera_fps,
                        fusion_state, fusion_confidence, fusion_algorithm, fusion_reason,
                        raw_json
                    ) VALUES (
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?,
                        ?, ?,
                        ?, ?, ?, ?,
                        ?
                    );
                    """,
                    (
                        frame.seq,
                        frame.timestamp,
                        mission_id,
                        frame.system.rover_id,
                        frame.system.system_status,
                        frame.system.rover_connection,
                        frame.system.hardware_latency_ms,
                        frame.system.battery_level,
                        frame.system.battery_voltage,
                        frame.thermal.target_temp,
                        frame.thermal.ambient_temp,
                        frame.thermal.status,
                        frame.thermal.raw_confidence,
                        frame.mmwave.presence_state,
                        frame.mmwave.distance_meters,
                        frame.mmwave.micro_doppler_rate,
                        frame.mmwave.status,
                        frame.mmwave.raw_confidence,
                        frame.gas.status,
                        frame.gas.hazard_level,
                        frame.gas.co_ppm,
                        frame.gas.combustible_lel,
                        frame.gas.voc_ppb,
                        frame.gas.oxygen_percent,
                        frame.camera.status,
                        frame.camera.fps,
                        frame.human_detection_fusion.state,
                        frame.human_detection_fusion.overall_confidence,
                        frame.human_detection_fusion.fusion_algorithm,
                        frame.human_detection_fusion.status_reason,
                        raw_json_str,
                    ),
                )

                # 2. Insert YOLO Detections (with deduplication on (telemetry_seq, track_id))
                if frame.yolo_detections:
                    for det in frame.yolo_detections:
                        await db.execute(
                            """
                            INSERT OR IGNORE INTO yolo_detections (
                                telemetry_seq, mission_id, track_id, class_label, confidence,
                                norm_x_min, norm_y_min, norm_width, norm_height,
                                distance_estimate, timestamp
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                            """,
                            (
                                frame.seq,
                                mission_id,
                                det.track_id,
                                det.class_label,
                                det.confidence,
                                det.bounding_box.norm_x_min,
                                det.bounding_box.norm_y_min,
                                det.bounding_box.norm_width,
                                det.bounding_box.norm_height,
                                det.distance_estimate,
                                det.timestamp or frame.timestamp,
                            ),
                        )

                await db.commit()
                return True

    async def get_historical_telemetry(
        self, mission_id_or_code: str, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Retrieves recorded telemetry frames for a historical mission.
        Decoupled from live stream: purely queries persisted historical rows.
        """
        mission = await self.get_mission(mission_id_or_code)
        target_id = mission.id if mission else mission_id_or_code

        async with self._lock:
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    """
                    SELECT seq, timestamp, mission_id, rover_id, system_status,
                           thermal_target_temp, thermal_ambient_temp,
                           mmwave_presence_state, mmwave_distance_m,
                           gas_hazard_level, gas_co_ppm,
                           fusion_state, fusion_confidence, fusion_reason
                    FROM telemetry_records
                    WHERE mission_id = ?
                    ORDER BY seq DESC
                    LIMIT ?;
                    """,
                    (target_id, limit),
                ) as cursor:
                    rows = await cursor.fetchall()

                return [dict(row) for row in rows]


# Global database manager instance
db_manager = DatabaseManager()
