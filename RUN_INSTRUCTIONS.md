# Running Rescue Rover Dashboard & FastAPI Backend on Windows

This guide provides step-by-step instructions for running both the **FastAPI Backend with Persistent SQLite Storage** and the **React + Vite Frontend** locally on Windows.

---

### Prerequisites
* **Node.js**: v18+ (tested on v22.17.1)
* **Python**: 3.10+ (tested on Python 3.11.9)
* **Shell**: Windows PowerShell or Command Prompt

---

### 1. Backend Setup & Run (FastAPI + SQLite)

1. Open a PowerShell terminal and navigate to the `backend/` directory:
   ```powershell
   cd c:\Users\krish\OneDrive\Desktop\Rover\backend
   ```

2. (Optional but recommended) Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

3. Install backend dependencies (includes FastAPI, Uvicorn, aiosqlite, Pillow, httpx, and pytest):
   ```powershell
   pip install -r requirements.txt
   ```

4. Configure Database (Optional):
   By default, the SQLite database is automatically created at `backend/rover.db`. To specify a custom database file location, set the `ROVER_DB_PATH` environment variable:
   ```powershell
   $env:ROVER_DB_PATH = "C:\Users\krish\OneDrive\Desktop\Rover\backend\rover.db"
   ```

5. Start the FastAPI server using Uvicorn:
   ```powershell
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

6. Verify backend is running & connected to SQLite:
   * **Health Check**: Open [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)
     * Response confirms `"database": {"type": "sqlite", "path": "..."}`
   * **Interactive Swagger Docs**: Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   * **Stored Missions**: [http://127.0.0.1:8000/api/missions](http://127.0.0.1:8000/api/missions)
   * **Telemetry Snapshot**: [http://127.0.0.1:8000/api/telemetry/latest](http://127.0.0.1:8000/api/telemetry/latest)
   * **WebSocket Stream**: `ws://127.0.0.1:8000/api/ws/telemetry`

---

### 2. Frontend Setup & Run (React + Vite)

1. Open a second PowerShell terminal in the project root:
   ```powershell
   cd c:\Users\krish\OneDrive\Desktop\Rover
   ```

2. Ensure your `.env` configuration file exists:
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   VITE_WS_BASE_URL=ws://localhost:8000
   ```

3. Install frontend dependencies:
   ```powershell
   npm install
   ```

4. Start the Vite development server:
   ```powershell
   npm run dev
   ```

5. Open [http://localhost:5173/](http://localhost:5173/) in your browser.

---

### 3. Database Persistence & Architecture Details

* **WAL Mode (Write-Ahead Logging)**: SQLite runs with `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;`, permitting non-blocking asynchronous concurrent reads while writes are serialized.
* **Schema Auto-Initialization**: Automatically creates `missions`, `mission_sensor_summaries`, `mission_events`, `telemetry_records`, and `yolo_detections` tables on first launch.
* **Default Seeding**: Seeds initial deployment records (`MISSION-2026-09`, `MISSION-2026-08`, `MISSION-2026-07`) only if the database is newly initialized.
* **Reconnection Deduplication**: `INSERT OR IGNORE` on `(mission_id, event_id)` prevents duplicate events during WebSocket reconnections or retries.
* **Gas Telemetry Isolation**: Environmental hazard gas readings (`gas_co_ppm`, `gas_combustible_lel`, etc.) are persisted exclusively to dedicated gas columns and never blended into the Tri-Modal human detection fusion matrix.
* **Historical Decoupling**: Historical telemetry is queried strictly from stored records via `GET /api/missions/{id}/telemetry` without mingling with live optical or radar streams.

---

### 4. Database Backup & Maintenance

Because the database uses SQLite WAL mode, you can safely create hot backups while the server is actively running.

**Option A: PowerShell File Copy**
```powershell
Copy-Item "c:\Users\krish\OneDrive\Desktop\Rover\backend\rover.db" "c:\Users\krish\OneDrive\Desktop\Rover\backend\rover_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"
```

**Option B: SQLite Online Backup Command**
```powershell
sqlite3 backend\rover.db ".backup 'backend\rover_backup.db'"
```

---

### 5. Running Automated Backend & Frontend Tests

**Run Pytest Persistence Test Suite:**
```powershell
cd c:\Users\krish\OneDrive\Desktop\Rover\backend
python -m pytest tests/test_persistence.py -v
```

**Run Frontend Code Quality & Linter Checks:**
```powershell
cd c:\Users\krish\OneDrive\Desktop\Rover
npm run lint
npm run build
```
