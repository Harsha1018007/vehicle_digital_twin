"""
Real-Time Anomaly Detector
==========================
Listens on the CAN bus, runs ML inference on each message, and emits
fault alerts.
"""

import can
import joblib
import numpy as np
import struct
import time
import argparse
from pathlib import Path
from collections import defaultdict


# Latest values from each ECU (shared state for combined inference)
latest_state = defaultdict(lambda: None)


def load_model(model_path: str, scaler_path: str):
    """Load trained model and scaler."""
    model = joblib.load(model_path)
    scaler = joblib.load(scaler_path)
    return model, scaler


def update_state_from_message(msg: can.Message):
    """Decode a CAN message and update the latest state."""
    if msg.arbitration_id == 0x100:  # Engine
        rpm, temp_x10, throttle = struct.unpack('>HHB', msg.data[:5])
        latest_state['rpm'] = rpm
        latest_state['coolant_temp'] = temp_x10 / 10.0
        latest_state['throttle'] = throttle

    elif msg.arbitration_id == 0x200:  # Brake
        pressure_x10, abs_status, pedal = struct.unpack('>HBB', msg.data[:4])
        latest_state['brake_pressure'] = pressure_x10 / 10.0
        latest_state['abs_status'] = abs_status
        latest_state['pedal_position'] = pedal

    elif msg.arbitration_id == 0x300:  # Speed
        speed_x10, fl_x10, fr_x10 = struct.unpack('>HHH', msg.data[:6])
        latest_state['speed'] = speed_x10 / 10.0
        latest_state['wheel_fl'] = fl_x10 / 10.0
        latest_state['wheel_fr'] = fr_x10 / 10.0


def build_feature_vector():
    """Build the feature vector required by the model."""
    feature_keys = [
        'rpm', 'coolant_temp', 'throttle',
        'brake_pressure', 'abs_status', 'pedal_position',
        'speed', 'wheel_fl', 'wheel_fr'
    ]
    # Use 0 for missing values until we get first message from each ECU
    return np.array([[latest_state.get(k) or 0 for k in feature_keys]])


def diagnose_fault(features: np.ndarray) -> str:
    """Heuristic fault classification based on feature values."""
    rpm, temp, throttle, pressure, abs_st, pedal, speed, fl, fr = features[0]

    if rpm > 7000:
        return "🔴 Engine over-rev detected (RPM critical)"
    if temp > 115:
        return "🔴 Engine overheating detected"
    if pedal > 50 and pressure < 5:
        return "🔴 Brake failure (pedal pressed, no pressure)"
    if abs(fl - fr) > 15:
        return "🔴 Wheel speed mismatch (ABS sensor fault)"
    if speed > 200:
        return "🔴 Impossible speed reading (sensor fault)"
    if pressure > 180:
        return "🔴 Abnormal brake pressure spike"

    return "⚠️  Unknown anomaly pattern"


def main(model_path: str, scaler_path: str):
    """Run real-time anomaly detection loop."""
    print(f"[DETECTOR] Loading model from {model_path}")
    model, scaler = load_model(model_path, scaler_path)

    try:
        bus = can.interface.Bus(channel='vcan0', bustype='socketcan')
    except Exception as e:
        print(f"[DETECTOR] Falling back to virtual: {e}")
        bus = can.interface.Bus(bustype='virtual', channel='vcan0')

    print("[DETECTOR] Listening for anomalies on vcan0...")

    msg_count = 0
    anomaly_count = 0

    try:
        while True:
            msg = bus.recv(timeout=1.0)
            if msg is None:
                continue

            update_state_from_message(msg)
            msg_count += 1

            # Wait until we have data from all 3 ECUs before classifying
            required = ['rpm', 'brake_pressure', 'speed']
            if not all(latest_state.get(k) is not None for k in required):
                continue

            features = build_feature_vector()
            features_scaled = scaler.transform(features)
            prediction = model.predict(features_scaled)[0]
            score = model.decision_function(features_scaled)[0]

            if prediction == -1:
                anomaly_count += 1
                diagnosis = diagnose_fault(features)
                print(f"[DETECTOR] {diagnosis} | "
                      f"Score: {score:.3f} | "
                      f"State: RPM={latest_state['rpm']} "
                      f"Temp={latest_state['coolant_temp']:.1f}°C "
                      f"Speed={latest_state['speed']:.1f}km/h "
                      f"Brake={latest_state['brake_pressure']:.1f}bar")

            if msg_count % 100 == 0:
                print(f"[DETECTOR] Processed {msg_count} msgs, "
                      f"{anomaly_count} anomalies "
                      f"({100 * anomaly_count / msg_count:.1f}%)")

    except KeyboardInterrupt:
        print(f"\n[DETECTOR] Stopped. {anomaly_count}/{msg_count} anomalies detected")
        bus.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Real-time anomaly detector")
    parser.add_argument('--model', default='ml_model/model.pkl')
    parser.add_argument('--scaler', default='ml_model/scaler.pkl')
    args = parser.parse_args()

    if not Path(args.model).exists():
        print(f"Model not found: {args.model}. Train it first with:")
        print("  python ml_model/train_model.py")
        exit(1)

    main(args.model, args.scaler)
