"""
Speed ECU Simulator
===================
Simulates an automotive Speed/Wheel Sensor ECU.
Sends CAN messages containing:
- Vehicle Speed (km/h)
- Wheel Speed Front Left (km/h)
- Wheel Speed Front Right (km/h)

CAN ID: 0x300 (Speed ECU standard ID)
DLC: 8 bytes
"""

import can
import time
import random
import struct
import argparse


class SpeedECU:
    """Simulates a Speed/Wheel Sensor ECU."""

    CAN_ID = 0x300
    BUS_CHANNEL = 'vcan0'

    def __init__(self, fault_mode: bool = False):
        self.fault_mode = fault_mode
        try:
            self.bus = can.interface.Bus(channel=self.BUS_CHANNEL, bustype='socketcan')
            print(f"[SPEED_ECU] Connected to {self.BUS_CHANNEL}")
        except Exception as e:
            print(f"[SPEED_ECU] Falling back to virtual bus: {e}")
            self.bus = can.interface.Bus(bustype='virtual', channel='vcan0')

        self.speed = 0.0
        self.wheel_fl = 0.0
        self.wheel_fr = 0.0
        self._stuck_counter = 0

    def generate_normal_data(self):
        """Generate realistic speed data with smooth acceleration."""
        # Random walk between 0-120 km/h
        delta = random.uniform(-3, 3)
        self.speed += delta
        self.speed = max(0, min(self.speed, 120))

        # Wheel speeds slightly differ (due to differential, turning, etc.)
        self.wheel_fl = self.speed + random.uniform(-0.5, 0.5)
        self.wheel_fr = self.speed + random.uniform(-0.5, 0.5)

    def inject_fault(self):
        """Inject speed sensor faults."""
        fault_type = random.choice(['sensor_stuck', 'wheel_mismatch', 'impossible_speed'])

        if fault_type == 'sensor_stuck':
            # Speed sensor stuck at constant value
            self._stuck_counter = 10  # Stuck for next 10 messages
            print("[SPEED_ECU] ⚠️  FAULT INJECTED: Sensor stuck")

        elif fault_type == 'wheel_mismatch':
            # Front wheels reporting very different speeds (ABS-relevant fault)
            self.wheel_fl = self.speed + 25
            self.wheel_fr = self.speed - 25
            print("[SPEED_ECU] ⚠️  FAULT INJECTED: Wheel speed mismatch")

        elif fault_type == 'impossible_speed':
            # Physically impossible speed
            self.speed = random.uniform(250, 350)
            self.wheel_fl = self.speed
            self.wheel_fr = self.speed
            print("[SPEED_ECU] ⚠️  FAULT INJECTED: Impossible speed reading")

    def build_frame(self) -> bytes:
        """
        Build the 8-byte CAN data payload.

        Frame layout:
            Bytes 0-1: Vehicle Speed x 10 (uint16)
            Bytes 2-3: Wheel FL Speed x 10 (uint16)
            Bytes 4-5: Wheel FR Speed x 10 (uint16)
            Bytes 6-7: Reserved
        """
        data = struct.pack(
            '>HHHH',
            int(self.speed * 10),
            int(self.wheel_fl * 10),
            int(self.wheel_fr * 10),
            0
        )
        return data

    def send_message(self):
        if self._stuck_counter > 0:
            # Don't update speed (sensor stuck)
            self._stuck_counter -= 1
        elif self.fault_mode and random.random() < 0.05:
            self.inject_fault()
        else:
            self.generate_normal_data()

        data = self.build_frame()
        message = can.Message(
            arbitration_id=self.CAN_ID,
            data=data,
            is_extended_id=False
        )

        try:
            self.bus.send(message)
            print(f"[SPEED_ECU] Speed={self.speed:.1f}km/h "
                  f"FL={self.wheel_fl:.1f} FR={self.wheel_fr:.1f} "
                  f"| CAN ID: 0x{self.CAN_ID:03X}")
        except can.CanError as e:
            print(f"[SPEED_ECU] Send failed: {e}")

    def run(self, frequency_hz: float = 10.0):
        period = 1.0 / frequency_hz
        print(f"[SPEED_ECU] Starting at {frequency_hz} Hz "
              f"(fault_mode={self.fault_mode})")
        try:
            while True:
                self.send_message()
                time.sleep(period)
        except KeyboardInterrupt:
            print("\n[SPEED_ECU] Shutting down")
            self.bus.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Speed ECU Simulator")
    parser.add_argument('--faults', action='store_true')
    parser.add_argument('--freq', type=float, default=10.0)
    args = parser.parse_args()

    ecu = SpeedECU(fault_mode=args.faults)
    ecu.run(frequency_hz=args.freq)
