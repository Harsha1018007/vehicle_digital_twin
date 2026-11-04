# 🚗 Vehicle Digital Twin with CAN Bus Simulation & AI Fault Detection

This repository contains a software vehicle network with three simulated ECUs (Engine, Brake, Speed), a virtual CAN interface, an Isolation Forest example, a FastAPI service, and two dashboard experiences: the original Streamlit view and my React/Vite explainer.

The Python code is the runnable simulation. The Embedded C files show matching frame-packing logic; they are not compiled into the Python application.

---

## 🎯 Project Overview

This project simulates a virtual vehicle running entirely in software. Three independent ECUs send CAN frames over a virtual CAN interface. The FastAPI service reads the bus and scores a combined vehicle state; the original Streamlit dashboard and my React/Vite site provide two user interfaces.

### Key Highlights

- **Pure software simulation** — no hardware required
- **Real CAN 2.0B protocol** frames using `python-can`
- **Embedded C firmware logic** for ECU message formatting
- **Isolation Forest anomaly detection** (the README's previously listed performance figures are unverified)
- **Real-time dashboard** showing live vehicle state and fault alerts
- **Docker containerized** for reproducible deployment

---

## 🏗️ Architecture

```
┌────────────┐  ┌───────────┐  ┌───────────┐
│ Engine ECU │  │ Brake ECU │  │ Speed ECU │
└─────┬──────┘  └─────┬─────┘  └─────┬─────┘
      └───────────────┴──────────────┘
                      │ CAN frames
                 ┌────▼─────┐
                 │  vcan0   │
                 └─┬──────┬─┘
          separate  │      │ API listener decodes latest ECU state
          listener  │      ▼
        ┌───────────▼─┐  ┌──────────────────────────┐
        │ CAN Logger  │  │ FastAPI + IsolationForest│
        │ CSV output  │  └────────────┬─────────────┘
        └─────────────┘               │
                         ┌────────────┴──────────┐
                         │ Streamlit / React UI  │
                         └───────────────────────┘
```

The logger and API are independent listeners on the bus. The API decodes messages and scores the combined latest ECU state itself; it does not read the logger CSV.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| ECU Firmware Logic | Embedded C |
| ECU Simulators | Python, `python-can` |
| CAN Interface | Virtual CAN (`vcan0`) |
| ML Model | Scikit-learn (Isolation Forest) |
| Backend API | FastAPI |
| Dashboards | Streamlit (original), React + Vite (added) |
| Containerization | Docker, Docker Compose |
| Version Control | Git |

---

## 📂 Project Structure

```
vehicle-digital-twin/
├── embedded_c/             # ECU firmware logic in Embedded C
│   ├── engine_ecu.c
│   ├── brake_ecu.c
│   └── can_frame.h
├── ml_model/               # AI fault detection
│   ├── train_model.py
│   ├── detect_anomalies.py
├── dashboard/              # FastAPI + Streamlit dashboard
│   ├── api.py
│   ├── streamlit_app.py
│   └── ecu_simulators/      # Python ECUs and CAN CSV logger
│       ├── engine_ecu.py
│       ├── brake_ecu.py
│       ├── speed_ecu.py
│       └── can_logger.py
├── frontend/               # React/Vite explainer and live twin dashboard
│   ├── src/
│   ├── index.html
│   └── package.json
├── data/                   # Created when the CAN logger writes its output
├── tests/                  # Unit tests
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Linux (Ubuntu 20.04+) or WSL2 on Windows
- Python 3.9+
- Docker (optional, for containerized run)

### Step 1: Setup Virtual CAN Interface

```bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

### Step 2: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 3: Train the model

```bash
python ml_model/train_model.py
```

The default trainer generates synthetic rows and writes `ml_model/model.pkl` and `ml_model/scaler.pkl`. The generated data contains both normal and anomaly examples; it is not a recorded vehicle dataset.

### Step 4: Run the ECU Simulators

Open 3 terminals:

```bash
# Terminal 1
python dashboard/ecu_simulators/engine_ecu.py

# Terminal 2
python dashboard/ecu_simulators/brake_ecu.py

# Terminal 3
python dashboard/ecu_simulators/speed_ecu.py
```

To enable random fault injection, add `--faults` to a simulator command. To log frames to CSV, run `python dashboard/ecu_simulators/can_logger.py --output data/can_log.csv` in another terminal.

### Step 5: Launch the original Streamlit dashboard

```bash
# Terminal 4: API (from the project root)
uvicorn dashboard.api:app --reload

# Terminal 5: original dashboard
streamlit run dashboard/streamlit_app.py
```

Open `http://localhost:8501` to view the digital twin dashboard.

### Run my React/Vite website

From the project root:

```bash
cd frontend
npm install
npm run dev
```

Open the local address printed by Vite (usually `http://localhost:5173/`). Do not open `frontend/index.html` directly. For a static build, run `npm run build` from `frontend`; the output is `frontend/dist/`. That built folder can be served by Live Server or a static host.

The website opens in **Simulated (browser)** mode and works without Linux or `vcan0`. It starts idle with no generated readings. Start begins with normal readings, then schedules one RPM spike on the project car after about 10 seconds of simulation time so the detector can produce a demo alert; pause, reset, or change the speed from 0.5× to 4×. Engine, brake, and speed values advance together, and the browser encodes CAN-style frames using the same IDs and byte layout as `canProtocol.js`. The live pipeline, CAN feed, vehicle readings, alerts, and score proxy all use that same browser simulation.

The browser detector is labeled **simulated detector**: it uses the training ranges and the FastAPI diagnosis cutoffs as a rule-based approximation, not the trained Isolation Forest. The browser adds a ten-frame persistence rule for a stuck speed signal because the API's current diagnosis rules do not explicitly detect that fault. Optional natural glitches are off by default. No browser-generated values or scores are measured results. **Live backend** remains available separately; it reads the FastAPI service and pauses browser simulation.

### Connect the website to the live API

Keep the API, CAN interface, ECU processes, and model running on Linux/WSL. Start the React website on the same computer and choose **Connect FastAPI** with `http://localhost:8000`. When the website is on another device or host, use the API machine's reachable address instead. The API enables browser CORS for the website connection.

The **Developer / API** drawer distinguishes an unreachable API, an unavailable `vcan0`, an API waiting for ECU frames, and a missing trained model. Open `http://localhost:8000/docs` to inspect the API. `/health` reports listener, CAN bus, model, and detector readiness; `/state` includes decoded values and per-ECU last-frame timestamps; `/anomalies` returns recorded anomaly events. `/stream` sends state over WebSocket at 5 Hz; the React site uses it for readings and polls REST for health and anomaly events. The detector waits until all three ECUs have sent an initial frame before scoring the combined state. FastAPI can return decoded state when the model is missing, but it cannot generate detector events until both model files exist. Run the training step above and restart the API to create/load them.

The API now requires SocketCAN `vcan0`. It does not fall back to python-can's in-process virtual bus, which cannot receive frames sent by the separate ECU processes.

### Deploy the website with GitHub Pages

The React/Vite frontend can be published as a static GitHub Pages site. The workflow at `.github/workflows/deploy-pages.yml` installs the frontend dependencies, builds `frontend/`, and deploys `frontend/dist/` whenever frontend files are pushed to `main`. It can also be started manually from the repository's **Actions** tab with **Deploy frontend to GitHub Pages**.

To enable it, push this project to a repository you own, open **Settings → Pages**, select **GitHub Actions** as the build and deployment source, then push to `main` or run the workflow manually. GitHub will show the published address under **Settings → Pages**. The checked-in Vite relative asset path supports repository URLs such as `https://<your-account>.github.io/<repository>/`.

GitHub Pages hosts only the frontend; it does not run FastAPI, the CAN listener, or the model. **Simulated (browser)** works without those services. For **Live backend**, deploy FastAPI separately to a reachable HTTPS host, configure its CORS settings for the Pages site, then enter its base address in the site's Developer / API drawer. The default `localhost:8000` address only refers to the visitor's own computer.

---

## 🧠 How the AI Fault Detection Works

1. **Training phase**: the default script creates synthetic normal and anomaly examples, scales nine combined ECU features, then fits the Isolation Forest on the combined rows.
2. **Inference phase**: the API updates the latest state when each ECU frame arrives, scales that combined state, and uses the model prediction (`-1` means anomaly).
3. **Alert generation**: the API stores a timestamp, decision score, diagnosis, and state snapshot when the prediction is anomalous.

### Example Faults Detected
- 🔴 Engine RPM spike above 7000 (engine overload)
- 🔴 Pedal position above 50% with pressure below 5 bar (brake failure rule in the API)
- 🔴 Front wheel speed difference above 15 km/h
- The speed simulator can hold a value for ten messages, but the API's diagnosis rules do not explicitly identify a constant stuck value.

---

## 📊 Results

The original README listed ~92% accuracy, <50 ms latency, 100 messages/sec, and <5% false positives. These figures have not been verified against live traffic. The trainer prints a report on the same synthetic data it fits, so that report is not an independent performance measurement. The code does not measure live latency or throughput.

---

## 🎓 What I Learned

- CAN 2.0B protocol frame structure (Arbitration ID, DLC, Data bytes)
- Embedded C programming for ECU message formatting
- How the Python API combines the latest readings from three simulated ECUs
- Isolation Forest for unsupervised anomaly detection
- Connecting a React interface to a small FastAPI service
- Docker containerization for reproducible deployments

---

## 🔮 Future Enhancements

- [ ] Add support for ISO-TP (CAN transport protocol)
- [ ] Integrate with real automotive simulators (CARLA, MATLAB Simulink)
- [ ] Deploy ML model to edge devices (Raspberry Pi)
- [ ] Add DBC file parsing for real-world OEM signal definitions
- [ ] Cloud deployment to AWS IoT Core

---

## What I added — my version

I added a React/Vite website with a step-by-step explainer for the CAN path, an example Engine frame, and an interactive browser simulation. The shared simulation drives four vehicle twins, CAN-compatible frame feeds, the animated pipeline, and a labeled rule-based score proxy. I can start, pause, reset, change simulation speed, and inject RPM, brake, or stuck-speed faults. The simulated detector does not run the Python Isolation Forest. Live backend mode remains connected to FastAPI; its API does not return GPS positions, raw CAN frames, or a continuous anomaly-score history.

The browser version is easiest to run on my Windows machine in simulated mode. I can start the Python CAN backend separately on Linux or WSL when I want to show the live connection. The OSM fleet map is centered on GITAM University in Visakhapatnam. Its four simulated cars follow static road geometry from OpenStreetMap's OSRM router; they are not GPS data or vehicle tracking. OpenStreetMap tiles need internet access, but no map API key. The browser reads the saved geometry and does not call a routing service at runtime.

To create or refresh the full-resolution campus road loops, run `python scripts/generate_gitam_routes.py` from the repository root. The script resolves named landmarks with Nominatim, asks you to confirm each OpenStreetMap match, and requests `overview=full&geometries=geojson` from OSRM. Nominatim does not index ICT Bhavan by its common name, so the script offers a documented published map pin for confirmation. For other missing landmarks, it tries shorter names and then asks you for another search phrase or a verified map-pin coordinate. It saves OSRM's returned roads to `frontend/public/data/gitam-routes.geojson`; it does not draw guessed route lines. The browser displays a notice until real routes are saved.

The API console is behind the **Developer / API** button and closed by default. It lists only routes implemented in `dashboard/api.py`: `GET /`, `GET /health`, `GET /state`, `GET /anomalies?limit=30`, and `WS /stream`. In live mode it records dashboard request status, response time, call count, and JSON response payloads; when FastAPI cannot be reached, the console says so. In browser mode it shows local simulated API responses and labels them as simulated.

---

## 👤 Author

**Niharika Banothu**
M.Tech (Artificial Intelligence) — NIT Bhopal
[LinkedIn](https://linkedin.com/in/niharikabanothu) | [GitHub](https://github.com/niharikabanothu)

---

## 📜 License

The upstream project is MIT-licensed; see [LICENSE](LICENSE). I credit the original author, Niharika Banothu, above. My frontend additions are documented in “What I added — my version.”
