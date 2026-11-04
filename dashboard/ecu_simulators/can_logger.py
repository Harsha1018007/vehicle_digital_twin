"""
CAN Bus Logger
==============
Listens on the virtual CAN bus and logs all messages to a CSV file
for ML model training.
"""

import can
import csv
import struct
import time
from datetime import datetime
from pathlib import Path


# CAN ID to ECU name mapping
ECU_MAP = {
    0x100: "ENGINE",
    0x200: "BRAKE",
    0x300: "SPEED",
}


def decode_engine(data: bytes) -> dict:
    """Decode an Engine ECU frame."""
    rpm, temp_x10, throttle = struct.unpack('>HHB', data[:5])
    return {
        'rpm': rpm,
        'coolant_temp': temp_x10 / 10.0,
        'throttle': throttle
    }


def decode_brake(data: bytes) -> dict:
    """Decode a Brake ECU frame."""
    pressure_x10, abs_status, pedal = struct.unpack('>HBB', data[:4])
    return {
        'brake_pressure': pressure_x10 / 10.0,
        'abs_status': abs_status,
        'pedal_position': pedal
    }


def decode_speed(data: bytes) -> dict:
    """Decode a Speed ECU frame."""
    speed_x10, fl_x10, fr_x10 = struct.unpack('>HHH', data[:6])
    return {
        'speed': speed_x10 / 10.0,
        'wheel_fl': fl_x10 / 10.0,
        'wheel_fr': fr_x10 / 10.0
    }


def main(output_file: str = 'data/can_log.csv', duration_sec: int = 60):
    """
    Log CAN messages to CSV for the specified duration.

    Args:
        output_file: Path to output CSV file
        duration_sec: Logging duration in seconds (0 = infinite)
    """
    Path(output_file).parent.mkdir(parents=True, exist_ok=True)

    try:
        bus = can.interface.Bus(channel='vcan0', bustype='socketcan')
    except Exception as e:
        print(f"[LOGGER] Falling back to virtual bus: {e}")
        bus = can.interface.Bus(bustype='virtual', channel='vcan0')

    print(f"[LOGGER] Logging to {output_file} for {duration_sec}s "
          f"(0 = infinite)")

    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            'timestamp', 'ecu', 'can_id',
            'rpm', 'coolant_temp', 'throttle',
            'brake_pressure', 'abs_status', 'pedal_position',
            'speed', 'wheel_fl', 'wheel_fr'
        ])

        start_time = time.time()
        msg_count = 0

        try:
            while True:
                msg = bus.recv(timeout=1.0)
                if msg is None:
                    continue

                ecu_name = ECU_MAP.get(msg.arbitration_id, "UNKNOWN")
                row = {
                    'timestamp': datetime.fromtimestamp(msg.timestamp).isoformat(),
                    'ecu': ecu_name,
                    'can_id': f"0x{msg.arbitration_id:03X}"
                }

                if ecu_name == "ENGINE":
                    row.update(decode_engine(msg.data))
                elif ecu_name == "BRAKE":
                    row.update(decode_brake(msg.data))
                elif ecu_name == "SPEED":
                    row.update(decode_speed(msg.data))

                writer.writerow([
                    row.get('timestamp'),
                    row.get('ecu'),
                    row.get('can_id'),
                    row.get('rpm', ''),
                    row.get('coolant_temp', ''),
                    row.get('throttle', ''),
                    row.get('brake_pressure', ''),
                    row.get('abs_status', ''),
                    row.get('pedal_position', ''),
                    row.get('speed', ''),
                    row.get('wheel_fl', ''),
                    row.get('wheel_fr', '')
                ])

                msg_count += 1
                if msg_count % 100 == 0:
                    print(f"[LOGGER] Logged {msg_count} messages")

                if duration_sec > 0 and (time.time() - start_time) > duration_sec:
                    print(f"[LOGGER] Duration complete. Total: {msg_count} messages")
                    break

        except KeyboardInterrupt:
            print(f"\n[LOGGER] Stopped. Logged {msg_count} messages")
        finally:
            bus.shutdown()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="CAN Bus Logger")
    parser.add_argument('--output', default='data/can_log.csv',
                        help="Output CSV file path")
    parser.add_argument('--duration', type=int, default=0,
                        help="Logging duration (seconds, 0 = infinite)")
    args = parser.parse_args()
    main(args.output, args.duration)
