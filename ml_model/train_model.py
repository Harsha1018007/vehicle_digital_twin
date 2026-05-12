"""
ML Anomaly Detection Model Trainer
===================================
Trains an Isolation Forest model on normal CAN bus traffic to detect
abnormal patterns indicating vehicle faults.

Usage:
    python ml_model/train_model.py
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix
import joblib
import argparse
from pathlib import Path


# Features the model uses to detect anomalies
FEATURES = [
    'rpm',
    'coolant_temp',
    'throttle',
    'brake_pressure',
    'abs_status',
    'pedal_position',
    'speed',
    'wheel_fl',
    'wheel_fr'
]


def generate_synthetic_data(n_normal: int = 5000, n_anomalies: int = 500):
    """
    Generate synthetic CAN data for training when real logs aren't available.

    Args:
        n_normal: Number of normal samples
        n_anomalies: Number of anomalous samples
    """
    np.random.seed(42)

    # ====== Normal Data ======
    normal = pd.DataFrame({
        'rpm': np.random.uniform(800, 3500, n_normal),
        'coolant_temp': np.random.uniform(80, 105, n_normal),
        'throttle': np.random.uniform(0, 80, n_normal),
        'brake_pressure': np.random.choice(
            [0, 0, 0, 0, 20, 40, 60], n_normal),  # Mostly no braking
        'abs_status': np.random.choice([0, 0, 0, 1], n_normal),
        'pedal_position': np.random.uniform(0, 60, n_normal),
        'speed': np.random.uniform(0, 120, n_normal),
        'wheel_fl': 0,
        'wheel_fr': 0,
        'is_anomaly': 0
    })
    # Make wheel speeds close to vehicle speed (normal physics)
    normal['wheel_fl'] = normal['speed'] + np.random.uniform(-0.5, 0.5, n_normal)
    normal['wheel_fr'] = normal['speed'] + np.random.uniform(-0.5, 0.5, n_normal)

    # ====== Anomaly Data ======
    anomalies = []

    # Fault type 1: RPM spike (engine over-rev)
    for _ in range(n_anomalies // 5):
        anomalies.append({
            'rpm': np.random.uniform(7500, 9500),
            'coolant_temp': np.random.uniform(95, 110),
            'throttle': np.random.uniform(90, 100),
            'brake_pressure': 0,
            'abs_status': 0,
            'pedal_position': 0,
            'speed': np.random.uniform(40, 100),
            'wheel_fl': 0,
            'wheel_fr': 0,
            'is_anomaly': 1
        })

    # Fault type 2: Engine overheat
    for _ in range(n_anomalies // 5):
        anomalies.append({
            'rpm': np.random.uniform(1500, 3000),
            'coolant_temp': np.random.uniform(120, 140),
            'throttle': np.random.uniform(20, 60),
            'brake_pressure': 0,
            'abs_status': 0,
            'pedal_position': 0,
            'speed': np.random.uniform(20, 80),
            'wheel_fl': 0,
            'wheel_fr': 0,
            'is_anomaly': 1
        })

    # Fault type 3: Brake failure (pedal pressed, no pressure)
    for _ in range(n_anomalies // 5):
        anomalies.append({
            'rpm': np.random.uniform(1000, 2500),
            'coolant_temp': np.random.uniform(85, 100),
            'throttle': np.random.uniform(0, 30),
            'brake_pressure': 0,
            'abs_status': 0,
            'pedal_position': np.random.uniform(60, 100),  # Pedal pressed
            'speed': np.random.uniform(60, 120),
            'wheel_fl': 0,
            'wheel_fr': 0,
            'is_anomaly': 1
        })

    # Fault type 4: Wheel speed mismatch (ABS sensor fault)
    for _ in range(n_anomalies // 5):
        speed = np.random.uniform(40, 100)
        anomalies.append({
            'rpm': np.random.uniform(1500, 3000),
            'coolant_temp': np.random.uniform(85, 100),
            'throttle': np.random.uniform(20, 50),
            'brake_pressure': 0,
            'abs_status': 0,
            'pedal_position': 0,
            'speed': speed,
            'wheel_fl': speed + 25,  # Big mismatch
            'wheel_fr': speed - 25,
            'is_anomaly': 1
        })

    # Fault type 5: Impossible speed
    for _ in range(n_anomalies // 5):
        anomalies.append({
            'rpm': np.random.uniform(2000, 4000),
            'coolant_temp': np.random.uniform(85, 100),
            'throttle': np.random.uniform(50, 100),
            'brake_pressure': 0,
            'abs_status': 0,
            'pedal_position': 0,
            'speed': np.random.uniform(250, 350),  # Physically impossible
            'wheel_fl': 0,
            'wheel_fr': 0,
            'is_anomaly': 1
        })

    anomaly_df = pd.DataFrame(anomalies)
    anomaly_df['wheel_fl'] = np.where(
        anomaly_df['wheel_fl'] == 0,
        anomaly_df['speed'],
        anomaly_df['wheel_fl']
    )
    anomaly_df['wheel_fr'] = np.where(
        anomaly_df['wheel_fr'] == 0,
        anomaly_df['speed'],
        anomaly_df['wheel_fr']
    )

    # Combine and shuffle
    full = pd.concat([normal, anomaly_df], ignore_index=True)
    full = full.sample(frac=1, random_state=42).reset_index(drop=True)

    return full


def train(data_csv: str = None,
          model_out: str = 'ml_model/model.pkl',
          scaler_out: str = 'ml_model/scaler.pkl'):
    """Train Isolation Forest on CAN data."""

    if data_csv and Path(data_csv).exists():
        print(f"[TRAIN] Loading data from {data_csv}")
        df = pd.read_csv(data_csv)
        # Fill missing per-ECU columns with forward fill
        df = df.ffill().bfill()
        if 'is_anomaly' not in df.columns:
            print("[TRAIN] No labels found, generating synthetic data instead")
            df = generate_synthetic_data()
    else:
        print("[TRAIN] No CSV provided, generating synthetic data")
        df = generate_synthetic_data()

    print(f"[TRAIN] Total samples: {len(df)}")
    print(f"[TRAIN] Normal: {(df['is_anomaly'] == 0).sum()}, "
          f"Anomaly: {(df['is_anomaly'] == 1).sum()}")

    X = df[FEATURES].values
    y = df['is_anomaly'].values

    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train Isolation Forest on full dataset (unsupervised)
    print("[TRAIN] Training Isolation Forest...")
    model = IsolationForest(
        n_estimators=200,
        contamination=0.1,  # Expect ~10% anomalies
        max_samples='auto',
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_scaled)

    # Evaluate
    predictions = model.predict(X_scaled)
    # Isolation Forest: -1 = anomaly, 1 = normal. Convert to 1/0.
    y_pred = np.where(predictions == -1, 1, 0)

    print("\n[TRAIN] === Model Performance ===")
    print(classification_report(y, y_pred, target_names=['Normal', 'Anomaly']))
    print("Confusion Matrix:")
    print(confusion_matrix(y, y_pred))

    # Save model + scaler
    Path(model_out).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_out)
    joblib.dump(scaler, scaler_out)
    print(f"\n[TRAIN] Saved model to {model_out}")
    print(f"[TRAIN] Saved scaler to {scaler_out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train anomaly detection model")
    parser.add_argument('--data', default=None,
                        help="CSV file with CAN logs (optional)")
    parser.add_argument('--model-out', default='ml_model/model.pkl')
    parser.add_argument('--scaler-out', default='ml_model/scaler.pkl')
    args = parser.parse_args()

    train(args.data, args.model_out, args.scaler_out)
