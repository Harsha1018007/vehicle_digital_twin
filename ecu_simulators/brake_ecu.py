"""
Brake ECU Simulator
===================
Simulates an automotive Brake Electronic Control Unit (ECU).
Sends CAN messages containing:
- Brake Pressure (bar)
- ABS Status (0 = Inactive, 1 = Active)
- Brake Pedal Position (%)

CAN ID: 0x200 (Brake ECU standard ID)
DLC: 8 bytes
"""

import can
import time
import random
import struct
import argparse


class BrakeECU:
    """Simulates a Brake ECU sending CAN frames over vcan0."""

    CAN_ID = 0x200
    BUS_CHANNEL = 'vcan0'

    def __init__(self, fault_mode: bool = False):
        self.fault_mode = fault_mode
        try:
            self.bus = can.interface.Bus(channel=self.BUS_CHANNEL, bustype='socketcan')
            print(f"[BRAKE_ECU] Connected to {self.BUS_CHANNEL}")
        except Exception as e:
            print(f"[BRAKE_ECU] Falling back to virtual bus: {e}")
            self.bus = can.interface.Bus(bustype='virtual', channel='vcan0')

        # Normal operating state
        self.brake_pressure = 0.0  # bar
        self.abs_status = 0
        self.pedal_position = 0  # %

    def generate_normal_data(self):
        """Generate realistic brake data."""
        # 80% of the time: no brake applied
        # 20% of the time: braking in progress
        if random.random() < 0.2:
            self.pedal_position = random.randint(20, 80)
            self.brake_pressure = self.pedal_position * 1.2  # Linear approx
            self.abs_status = 1 if self.brake_pressure > 70 else 0
        else:
            self.pedal_position = 0
            self.brake_pressure = 0.0
            self.abs_status = 0

    def inject_fault(self):
        """Inject brake-system faults."""
        fault_type = random.choice(['brake_failure', 'pressure_spike', 'abs_stuck'])

        if fault_type == 'brake_failure':
            # Pedal pressed but no pressure → brake failure
            self.pedal_position = random.randint(60, 100)
            self.brake_pressure = 0.0
            self.abs_status = 0
            print("[BRAKE_ECU] ⚠️  FAULT INJECTED: Brake failure (no pressure)")

        elif fault_type == 'pressure_spike':
            # Unexpected pressure spike
            self.brake_pressure = random.uniform(180, 250)
            print("[BRAKE_ECU] ⚠️  FAULT INJECTED: Brake pressure spike")

        elif fault_type == 'abs_stuck':
            self.abs_status = 1
            self.brake_pressure = 0
            print("[BRAKE_ECU] ⚠️  FAULT INJECTED: ABS stuck active")

    def build_frame(self) -> bytes:
        """
        Build the 8-byte CAN data payload.

        Frame layout:
            Bytes 0-1: Brake Pressure x 10 (uint16)
            Byte 2   : ABS Status (uint8)
            Byte 3   : Pedal Position (uint8)
            Bytes 4-7: Reserved
        """
        data = struct.pack(
            '>HBBBBBB',
            int(self.brake_pressure * 10),
            int(self.abs_status),
            int(self.pedal_position),
            0, 0, 0, 0
        )
        return data

    def send_message(self):
        if self.fault_mode and random.random() < 0.05:
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
            print(f"[BRAKE_ECU] Pressure={self.brake_pressure:.1f}bar "
                  f"ABS={self.abs_status} Pedal={self.pedal_position}% "
                  f"| CAN ID: 0x{self.CAN_ID:03X}")
        except can.CanError as e:
            print(f"[BRAKE_ECU] Send failed: {e}")

    def run(self, frequency_hz: float = 10.0):
        period = 1.0 / frequency_hz
        print(f"[BRAKE_ECU] Starting at {frequency_hz} Hz "
              f"(fault_mode={self.fault_mode})")
        try:
            while True:
                self.send_message()
                time.sleep(period)
        except KeyboardInterrupt:
            print("\n[BRAKE_ECU] Shutting down")
            self.bus.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Brake ECU Simulator")
    parser.add_argument('--faults', action='store_true')
    parser.add_argument('--freq', type=float, default=10.0)
    args = parser.parse_args()

    ecu = BrakeECU(fault_mode=args.faults)
    ecu.run(frequency_hz=args.freq)
