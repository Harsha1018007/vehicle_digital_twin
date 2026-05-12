"""
Digital Twin Dashboard - FastAPI Backend
=========================================
Provides REST API endpoints exposing the live vehicle state and
detected anomalies for the Streamlit dashboard.

Endpoints:
    GET /state          → Current ECU state snapshot
    GET /anomalies      → Recent anomaly events
    GET /health         → API health check
    WS  /stream         → WebSocket live stream
"""

import asyncio
import can
import joblib
import numpy as np
import struct
import threading
import time
from collections import deque, defaultdict
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(
    title="Vehicle Digital Twin API",
    description="Real-time CAN bus monitoring with AI fault detection",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ====================== Shared State ======================

class VehicleState:
    def __init__(self):
        self.engine = {'rpm': 0, 'coolant_temp': 0, 'throttle': 0}
        self.brake = {'brake_pressure': 0, 'abs_status': 0, 'pedal_position': 0}
        self.speed = {'speed': 0, 'wheel_fl': 0, 'wheel_fr': 0}
        self.last_update = None
        self.anomalies = deque(maxlen=50)
        self.total_messages = 0
        self.total_anomalies = 0
        self.lock = threading.Lock()


vehicle = VehicleState()


# ====================== Pydantic Models ======================

class StateResponse(BaseModel):
    engine: dict
    brake: dict
    speed: dict
    last_update: str | None
    total_messages: int
    total_anomalies: int


class AnomalyEvent(BaseModel):
    timestamp: str
    diagnosis: str
    score: float
    state_snapshot: dict


# ====================== CAN Listener Thread ======================

def diagnose_fault(state: dict) -> str:
    """Heuristic fault classification."""
    if state['engine']['rpm'] > 7000:
        return "Engine over-rev detected"
    if state['engine']['coolant_temp'] > 115:
        return "Engine overheating"
    if state['brake']['pedal_position'] > 50 and state['brake']['brake_pressure'] < 5:
        return "Brake failure - pedal pressed but no pressure"
    if abs(state['speed']['wheel_fl'] - state['speed']['wheel_fr']) > 15:
        return "Wheel speed mismatch"
    if state['speed']['speed'] > 200:
        return "Impossible speed reading"
    if state['brake']['brake_pressure'] > 180:
        return "Brake pressure spike"
    return "Unknown anomaly pattern"


def can_listener_thread(model_path: str, scaler_path: str):
    """Background thread that reads CAN and updates shared state."""
    try:
        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
        has_model = True
    except Exception as e:
        print(f"[API] Model not available: {e}")
        has_model = False

    try:
        bus = can.interface.Bus(channel='vcan0', bustype='socketcan')
    except Exception:
        try:
            bus = can.interface.Bus(bustype='virtual', channel='vcan0')
        except Exception as e:
            print(f"[API] CAN bus unavailable: {e}")
            return

    print("[API] CAN listener thread started")

    while True:
        try:
            msg = bus.recv(timeout=1.0)
            if msg is None:
                continue

            with vehicle.lock:
                vehicle.total_messages += 1
                vehicle.last_update = datetime.utcnow().isoformat()

                if msg.arbitration_id == 0x100:
                    rpm, temp_x10, throttle = struct.unpack('>HHB', msg.data[:5])
                    vehicle.engine = {
                        'rpm': rpm,
                        'coolant_temp': temp_x10 / 10.0,
                        'throttle': throttle
                    }
                elif msg.arbitration_id == 0x200:
                    pressure_x10, abs_st, pedal = struct.unpack('>HBB', msg.data[:4])
                    vehicle.brake = {
                        'brake_pressure': pressure_x10 / 10.0,
                        'abs_status': abs_st,
                        'pedal_position': pedal
                    }
                elif msg.arbitration_id == 0x300:
                    speed_x10, fl_x10, fr_x10 = struct.unpack('>HHH', msg.data[:6])
                    vehicle.speed = {
                        'speed': speed_x10 / 10.0,
                        'wheel_fl': fl_x10 / 10.0,
                        'wheel_fr': fr_x10 / 10.0
                    }

                # Run anomaly detection on combined state
                if has_model:
                    feature_vec = np.array([[
                        vehicle.engine['rpm'],
                        vehicle.engine['coolant_temp'],
                        vehicle.engine['throttle'],
                        vehicle.brake['brake_pressure'],
                        vehicle.brake['abs_status'],
                        vehicle.brake['pedal_position'],
                        vehicle.speed['speed'],
                        vehicle.speed['wheel_fl'],
                        vehicle.speed['wheel_fr']
                    ]])
                    scaled = scaler.transform(feature_vec)
                    prediction = model.predict(scaled)[0]
                    score = float(model.decision_function(scaled)[0])

                    if prediction == -1:
                        state_snapshot = {
                            'engine': dict(vehicle.engine),
                            'brake': dict(vehicle.brake),
                            'speed': dict(vehicle.speed)
                        }
                        diagnosis = diagnose_fault(state_snapshot)
                        vehicle.total_anomalies += 1
                        vehicle.anomalies.appendleft({
                            'timestamp': datetime.utcnow().isoformat(),
                            'diagnosis': diagnosis,
                            'score': score,
                            'state_snapshot': state_snapshot
                        })
        except Exception as e:
            print(f"[API] Listener error: {e}")
            time.sleep(0.5)


# ====================== API Endpoints ======================

@app.on_event("startup")
def startup_event():
    """Start CAN listener thread when API starts."""
    thread = threading.Thread(
        target=can_listener_thread,
        args=('ml_model/model.pkl', 'ml_model/scaler.pkl'),
        daemon=True
    )
    thread.start()


@app.get("/")
def root():
    return {
        "service": "Vehicle Digital Twin API",
        "version": "1.0.0",
        "endpoints": ["/state", "/anomalies", "/health", "/stream (WebSocket)"]
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "last_update": vehicle.last_update,
        "messages_received": vehicle.total_messages
    }


@app.get("/state", response_model=StateResponse)
def get_state():
    """Return the latest snapshot of all ECU states."""
    with vehicle.lock:
        return StateResponse(
            engine=dict(vehicle.engine),
            brake=dict(vehicle.brake),
            speed=dict(vehicle.speed),
            last_update=vehicle.last_update,
            total_messages=vehicle.total_messages,
            total_anomalies=vehicle.total_anomalies
        )


@app.get("/anomalies")
def get_anomalies(limit: int = 20):
    """Return recent anomaly events."""
    with vehicle.lock:
        return {
            "total": vehicle.total_anomalies,
            "events": list(vehicle.anomalies)[:limit]
        }


@app.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """Live-stream vehicle state at 5 Hz."""
    await websocket.accept()
    try:
        while True:
            with vehicle.lock:
                payload = {
                    'engine': dict(vehicle.engine),
                    'brake': dict(vehicle.brake),
                    'speed': dict(vehicle.speed),
                    'last_update': vehicle.last_update,
                    'anomaly_count': vehicle.total_anomalies
                }
            await websocket.send_json(payload)
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        pass
