# Vehicle Digital Twin — Project Documentation

This guide describes what is implemented in this repository, how to run its two dashboard paths, and what the demonstrations do and do not represent.

## 1. Project at a glance

The project has a Python CAN simulation and API, plus an independently runnable React/Vite website. The Python side has Engine, Brake, and Speed ECU scripts that format and send CAN frames. FastAPI reads the bus, keeps the latest decoded ECU state, and can score that state with a scikit-learn Isolation Forest. The original Streamlit dashboard reads the API. The React website contains a signal-path explainer, a multi-car map, and a browser-only simulation that can run without the Python backend.

The project vehicle in the website is the CAN tester: its three simulated ECU readings form the CAN-style feed, go through the browser detector, and determine its map speed. The other three map vehicles are simulated comparison traffic. The map routes are simulated paths, not GPS traces.

This is a software demonstration. It is not connected to a physical vehicle, physical ECU, or GPS device. Website values and routes are labeled simulated where they are shown.

## 2. System layout

```text
Python path
┌────────────┐  CAN frames  ┌─────────────────────┐
│ Engine ECU ├─────────────┤                     │
│ Brake ECU  ├──── vcan0 ──┤ FastAPI CAN listener├── REST / WebSocket ── React UI
│ Speed ECU  ├─────────────┤ + Isolation Forest  ├── REST ───────────── Streamlit UI
└────────────┘              └──────────┬──────────┘
                                       │
                              CAN logger writes CSV

Browser demonstration path
┌────────────────────────┐
│ React simulation state │── ECU readings / CAN-style frames ──┐
└────────────────────────┘                                     │
           ├── simulated detector ── alert / score ────────────┤
           └── Speed ECU reading ── moving project car ────────┘
```

The Python backend and browser simulation are separate data sources. Browser simulation does not send frames to `vcan0` or call the Python Isolation Forest. Live backend mode reads FastAPI and cannot inject faults into the backend from the website.

## 3. Repository map

| Path | Role |
| --- | --- |
| `dashboard/ecu_simulators/` | Python Engine, Brake, and Speed ECU senders plus the CSV logger |
| `dashboard/api.py` | CAN listener thread, latest-state store, anomaly events, REST and WebSocket API |
| `dashboard/streamlit_app.py` | Original Streamlit dashboard |
| `embedded_c/` | Embedded C examples of ECU frame formatting; these are not compiled into the Python application |
| `ml_model/train_model.py` | Builds the scaler and Isolation Forest model artifacts |
| `ml_model/detect_anomalies.py` | Standalone detector script; it is separate from the detector loop inside FastAPI |
| `frontend/src/` | React explainer, dashboard, map, browser simulation, CAN encoding and styling |
| `frontend/public/data/gitam-routes.geojson` | Static route geometry loaded by the map |
| `scripts/generate_gitam_routes.py` | Regenerates route geometry from mapped locations and the OSRM routing service |
| `.github/workflows/deploy-pages.yml` | Builds the frontend and deploys it to GitHub Pages |
| `tests/` | Python unit tests for the ECU code |

## 4. CAN message format

The Python ECU scripts send standard CAN frames with an 8-byte payload. The IDs below are written in hexadecimal; the backend decodes the matching big-endian fields.

| ECU | Arbitration ID | DLC | Payload |
| --- | --- | ---: | --- |
| Engine | `0x100` | 8 | Bytes 0–1 RPM as unsigned 16-bit; bytes 2–3 coolant temperature ×10; byte 4 throttle; bytes 5–7 reserved zeroes |
| Brake | `0x200` | 8 | Bytes 0–1 brake pressure ×10 as unsigned 16-bit; byte 2 ABS status; byte 3 pedal position; bytes 4–7 reserved zeroes |
| Speed | `0x300` | 8 | Bytes 0–1 vehicle speed ×10; bytes 2–3 front-left wheel speed ×10; bytes 4–5 front-right wheel speed ×10; bytes 6–7 reserved zeroes |

### Example: 2,400 RPM

The Engine frame stores RPM as a big-endian unsigned 16-bit integer. `2400` decimal is `0x0960`, so its two RPM bytes are `09 60`. With coolant at 85.0 °C and throttle at 20%, the full example payload is:

```text
CAN ID 0x100 · DLC 8 · 09 60 03 52 14 00 00 00
              RPM     coolant   throttle reserved
              2400    850 / 10  20%
```

The Browser frame encoder in `frontend/src/data/canProtocol.js` follows the same layout. For actual frame construction and decoding, use the Python encoders/listeners and this file as the implementation references.

## 5. Python CAN and FastAPI path

### ECU behavior

Each ECU defaults to a send rate of 10 Hz and accepts `--freq` to change it. `--faults` enables random fault attempts at approximately 5% per send cycle in the corresponding simulator. Each simulator uses its own fault choices; a fault is not guaranteed to be detected on every attempt.

The ECU scripts first try SocketCAN on `vcan0`. Their fallback to python-can's in-process `virtual` bus is not a replacement for a shared Linux CAN interface across separate processes. For the multi-process API setup documented here, use SocketCAN `vcan0`.

### Train the model

From the repository root, install Python packages and train the default artifacts:

```bash
pip install -r requirements.txt
python ml_model/train_model.py
```

This writes `ml_model/model.pkl` and `ml_model/scaler.pkl`. By default, the trainer creates 5,000 synthetic normal rows and 500 synthetic anomaly rows. Although the model is unsupervised, the current trainer fits the Isolation Forest on the combined normal-and-anomaly dataset. It then prints a classification report on those same rows, so that report is an in-sample result, not independent validation or evidence of live accuracy. No original headline performance figures should be presented as verified from this code alone.

If a CSV is supplied with `--data`, it must contain the nine expected feature columns and `is_anomaly` labels; otherwise the trainer falls back to its generated dataset. Output file paths can be changed with `--model-out` and `--scaler-out`.

### Start SocketCAN and the processes

On Linux or a WSL setup with SocketCAN support, create the virtual CAN interface once:

```bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

If `vcan0` already exists, skip the `ip link add` line and ensure it is up. Then start the three ECU scripts in separate terminals:

```bash
python dashboard/ecu_simulators/engine_ecu.py
python dashboard/ecu_simulators/brake_ecu.py
python dashboard/ecu_simulators/speed_ecu.py
```

For random ECU-side fault injection, append `--faults` to any or all commands. To set a custom send rate, use for example `--freq 5`.

Start FastAPI from the repository root in another terminal:

```bash
uvicorn dashboard.api:app --host 0.0.0.0 --port 8000
```

FastAPI starts its CAN listener when the app starts. It listens on `vcan0` and loads the model and scaler from `ml_model/`. It waits until it has received at least one message from each of the three ECU IDs before scoring the combined feature vector. If the model files are missing, the API can still report decoded state, but it cannot produce Isolation Forest detections.

Optionally run the CSV logger in a further terminal:

```bash
python dashboard/ecu_simulators/can_logger.py --output data/can_log.csv --duration 60
```

Use `--duration 0` or omit `--duration` to keep logging until stopped. The logger is an independent CAN listener; the FastAPI service does not read its CSV output.

Run the original Streamlit UI if needed:

```bash
streamlit run dashboard/streamlit_app.py
```

Open `http://localhost:8501`. FastAPI's interactive API documentation is at `http://localhost:8000/docs`.

## 6. FastAPI interface

| Method | Path | What it returns |
| --- | --- | --- |
| `GET` | `/` | Service information and endpoint names |
| `GET` | `/health` | Listener, bus, model and readiness details plus message and anomaly counts |
| `GET` | `/state` | Latest decoded Engine, Brake and Speed values, ECU timestamps and counters |
| `GET` | `/anomalies?limit=20` | Recent stored anomaly events; `limit` controls how many are returned |
| `WS` | `/stream` | Latest decoded state sent every 0.2 seconds (5 Hz) |

The current API CORS middleware allows all origins. For a public backend deployment, review CORS to allow only the frontend origin you intend to serve. `GET /health` currently returns a `status` string of `healthy` even when bus or model status has a problem; inspect `listener_status`, `bus_connected`, `model_loaded`, and `detection_ready` as well.

The API provides decoded state and anomaly events, not raw live CAN frames, GPS coordinates, or a normal-reading score time series. The web dashboard can therefore display raw-style CAN feed and continuous score history in browser simulation, but cannot claim these are returned by the live API.

## 7. Detector behavior and fault rules

### Python API detector

The API combines the latest 9 decoded features in this order: RPM, coolant temperature, throttle, brake pressure, ABS status, pedal position, vehicle speed, front-left wheel speed and front-right wheel speed. It transforms that vector with the saved `StandardScaler`, then uses `IsolationForest.predict` (`-1` means anomaly) and `decision_function` for the score. A separate heuristic assigns a readable diagnosis for known cases:

- RPM above 7,000: engine over-rev.
- Coolant above 115 °C: engine overheating.
- Pedal above 50% with brake pressure below 5 bar: brake failure.
- Front wheel speeds differing by more than 15 km/h: wheel mismatch.
- Vehicle speed above 200 km/h: impossible speed.
- Brake pressure above 180 bar: pressure spike.

An anomaly not covered by these diagnosis rules is labeled as an unknown pattern. The Python API has no explicit constant-stuck-speed rule.

### Browser simulated detector

The website labels this as a **simulated detector**. It is a transparent threshold/range approximation, not the trained Python Isolation Forest. It uses the same named ranges and explicit fault cutoffs where applicable, and defines zero as the score boundary: negative proxy scores are flagged. Its stuck-speed fault adds a browser-only persistence check that flags after ten unchanged simulation steps.

In browser simulation, a fresh Start begins with normal readings and schedules an RPM fault on the project vehicle after about 10 seconds of simulation time. The RPM value then remains at the injected fault level until **Clear fault** is used. The detector evaluates generated readings; the alert is shown only after it flags the value. Pause freezes the delay; speed control scales simulation time. Manual fault buttons and the optional natural-glitch switch are separate controls. Natural glitches are off by default and may or may not be flagged.

## 8. React website and browser simulation

### Run locally

From the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open the local address printed by Vite. For a production build, run `npm run build` in `frontend/`; Vite writes the static site to `frontend/dist/`.

### Dashboard controls

- **Simulated (browser):** runs locally in the browser without FastAPI, Linux, SocketCAN, or `vcan0`. It starts idle; Start begins readings and a delayed demo RPM fault. Pause, Resume, Reset and the 0.5×–4× control affect the same simulation state.
- **Live backend:** reads FastAPI's `/health`, `/state`, `/anomalies` and `/stream` services. The API base URL can be entered through the Developer / API drawer. `localhost` refers to the visitor's own device, so it is not a public API address when the site is hosted online.
- **Fault lab:** browser fault buttons can inject RPM spike, brake failure or stuck speed into the selected simulated car. Alerts are generated when the simulated detector flags the readings; they are not hardcoded backend responses.
- **Project vehicle:** its ECU values generate the browser CAN frames and the detector input. In Live backend mode, the project car uses decoded API state when available. Other traffic is simulated and does not correspond to extra Python ECUs.

### Fleet map

The map uses Leaflet, OpenStreetMap tiles and visible OSM attribution. It loads the saved GeoJSON route file from `frontend/public/data/gitam-routes.geojson`; it does not call OSRM to route vehicles at runtime. The route generator script uses Nominatim lookups and OSRM's driving route service, asks for confirmation of candidate locations, and saves the returned geometry. Internet is needed for map tiles. Routes remain simulated and do not represent GPS tracking.

Car position advances by traveled distance along route geometry, with speed based on that car's Speed ECU state. Corners reduce simulated speed; the marker bearing is smoothed and cars are held if their next positions would be too close. The Route debug control draws saved route lines for visual inspection.

To regenerate route geometry, run from the repository root:

```bash
python scripts/generate_gitam_routes.py
```

This requires network access to its geocoding and routing services and saves the result to `frontend/public/data/gitam-routes.geojson`. It is a one-time or maintenance command, not part of the hosted site's request path.

## 9. GitHub Pages deployment

The repository is configured to deploy the static frontend to:

**https://harsha1018007.github.io/vehicle_digital_twin/**

The `.github/workflows/deploy-pages.yml` workflow runs on pushes to `main` that change `frontend/**` or the workflow file, and can also be started manually from the GitHub Actions tab. GitHub Pages' publishing source must be set to **GitHub Actions** in repository Settings → Pages.

The workflow installs dependencies from `frontend/package-lock.json`, builds the Vite site, uploads `frontend/dist/`, and deploys it. Future frontend changes are published after they are committed and pushed to `main`. Pages hosts static frontend files only. It does not run FastAPI, the CAN listener, ECU sender processes, Streamlit, or the Isolation Forest model. The browser simulation remains available without those services; a live backend needs a separate reachable HTTPS deployment and matching CORS configuration.

## 10. Known limitations and maintenance notes

- The README's historical accuracy, latency, throughput and false-positive figures are not verified measurements. The trainer's default evaluation uses the same synthetic rows it fitted.
- Browser readings, score proxy, faults, traffic cars and vehicle locations are simulated. The website's simplified detector is not the trained Isolation Forest.
- Static route geometry describes simulated roads, not a live vehicle location. OSM tiles require internet access.
- Python model artifacts are generated locally and ignored by Git. Retrain the model on the backend host before expecting API detections.
- The current `docker-compose.yml` commands reference `ecu_simulators/...` at the repository root, while the checked-in Python ECU files are under `dashboard/ecu_simulators/`. Review/update those Compose commands before relying on that deployment path.
- `ml_model/detect_anomalies.py` is a standalone command-line detector. FastAPI has its own CAN listener and model-inference code; running the standalone script is not required by FastAPI.

## 11. License and attribution

The upstream project is MIT-licensed; see the repository's `LICENSE`. The original project author is Niharika Banothu. The React/Vite explainer, browser simulation, fleet map, and Pages deployment workflow are additions in this version.
