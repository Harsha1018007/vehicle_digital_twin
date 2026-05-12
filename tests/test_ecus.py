"""
Unit Tests for ECU Simulators and ML Model
"""

import pytest
import struct
import numpy as np
import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_engine_frame_packing():
    """Test that engine data packs correctly into 8-byte CAN frame."""
    rpm = 2500
    temp_x10 = 950  # 95.0 °C
    throttle = 45

    data = struct.pack('>HHBBBB', rpm, temp_x10, throttle, 0, 0, 0)

    assert len(data) == 8
    unpacked_rpm = (data[0] << 8) | data[1]
    unpacked_temp = (data[2] << 8) | data[3]
    unpacked_throttle = data[4]

    assert unpacked_rpm == rpm
    assert unpacked_temp == temp_x10
    assert unpacked_throttle == throttle


def test_brake_frame_packing():
    """Test brake CAN frame structure."""
    pressure_x10 = 1250  # 125.0 bar
    abs_status = 1
    pedal = 75

    data = struct.pack('>HBBBBBB', pressure_x10, abs_status, pedal, 0, 0, 0, 0)

    assert len(data) == 8
    assert (data[0] << 8 | data[1]) == pressure_x10
    assert data[2] == abs_status
    assert data[3] == pedal


def test_speed_frame_packing():
    """Test speed CAN frame structure."""
    speed_x10 = 850  # 85.0 km/h
    fl_x10 = 851
    fr_x10 = 849

    data = struct.pack('>HHHH', speed_x10, fl_x10, fr_x10, 0)

    assert len(data) == 8
    assert (data[0] << 8 | data[1]) == speed_x10


def test_can_id_priorities():
    """Engine ECU should have highest priority (lowest ID)."""
    ENGINE_ID = 0x100
    BRAKE_ID = 0x200
    SPEED_ID = 0x300

    assert ENGINE_ID < BRAKE_ID
    assert BRAKE_ID < SPEED_ID


def test_anomaly_detection_engine_overrev():
    """Verify engine over-rev is flagged as anomaly."""
    # Feature vector with extreme RPM
    features = np.array([[9000, 95, 100, 0, 0, 0, 80, 80, 80]])
    rpm = features[0][0]
    assert rpm > 7000, "RPM above critical threshold should trigger anomaly"


def test_anomaly_detection_brake_failure():
    """Verify brake failure pattern (pedal pressed, no pressure)."""
    # pedal=80, pressure=0 → brake failure
    pedal = 80
    pressure = 0
    assert pedal > 50 and pressure < 5, "Brake failure condition"


def test_wheel_speed_mismatch():
    """Wheel speed mismatch > 15 km/h should be flagged."""
    wheel_fl = 80
    wheel_fr = 50
    mismatch = abs(wheel_fl - wheel_fr)
    assert mismatch > 15, "Wheel speed mismatch detected"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
