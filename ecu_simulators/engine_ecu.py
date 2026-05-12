"""
Engine ECU Simulator
====================
Simulates an automotive Engine Electronic Control Unit (ECU).
Sends CAN messages containing:
- Engine RPM (rotations per minute)
- Coolant Temperature (degrees Celsius)
- Throttle Position (%)

CAN ID: 0x100 (Engine ECU standard ID)
DLC: 8 bytes
"""

import can
import time
import random
import struct
import argparse


class EngineECU:
    """Simulates an Engine ECU sending CAN frames over vcan0."""

    CAN_ID = 0x100  # Engine ECU arbitration ID
    BUS_CHANNEL = 'vcan0'

    def __init__(self, fault_mode: bool = False):
        """
        Initialize the Engine ECU.

        Args:
            fault_mode: If True, occasionally inject faulty data for testing.
        """
        self.fault_mode = fault_mode
        try:
            self.bus = can.interface.Bus(channel=self.BUS_CHANNEL, bustype='socketcan')
            print(f"[ENGINE_ECU] Connected to {self.BUS_CHANNEL}")
        except Exception as e:
            print(f"[ENGINE_ECU] Falling back to virtual bus: {e}")
            self.bus = can.interface.Bus(bustype='virtual', channel='vcan0')

        # Normal operating range
        self.rpm = 800
        self.coolant_temp = 85
        self.throttle = 20

    def generate_normal_data(self):
        """Generate realistic engine data in normal operating range."""
        # Smooth random walk
        self.rpm += random.randint(-100, 150)
        self.rpm = max(800, min(self.rpm, 3500))

        self.coolant_temp += random.uniform(-0.5, 0.7)
        self.coolant_temp = max(80, min(self.coolant_temp, 105))

        self.throttle += random.randint(-5, 5)
        self.throttle = max(0, min(self.throttle, 100))

    def inject_fault(self):
        """Randomly inject a fault for testing the AI detector."""
        fault_type = random.choice(['rpm_spike', 'overheat', 'throttle_stuck'])

        if fault_type == 'rpm_spike':
            self.rpm = random.randint(7500, 9000)  # Dangerous over-rev
            print("[ENGINE_ECU] ⚠️  FAULT INJECTED: RPM spike")
        elif fault_type == 'overheat':
            self.coolant_temp = random.uniform(120, 140)  # Overheating
            print("[ENGINE_ECU] ⚠️  FAULT INJECTED: Engine overheat")
        elif fault_type == 'throttle_stuck':
            self.throttle = 100  # Throttle stuck at full
            print("[ENGINE_ECU] ⚠️  FAULT INJECTED: Throttle stuck")

    def build_frame(self) -> bytes:
        """
        Build the 8-byte CAN data payload.

        Frame layout (Big Endian):
            Bytes 0-1: RPM (uint16)
            Bytes 2-3: Coolant Temp x 10 (uint16)
            Byte 4   : Throttle Position (uint8)
            Bytes 5-7: Reserved
        """
        data = struct.pack(
            '>HHBBBB',
            int(self.rpm),
            int(self.coolant_temp * 10),
            int(self.throttle),
            0, 0, 0
        )
        return data

    def send_message(self):
        """Send one CAN frame and update internal state."""
        # Inject fault ~5% of the time if fault_mode enabled
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
            print(f"[ENGINE_ECU] RPM={self.rpm} Temp={self.coolant_temp:.1f}°C "
                  f"Throttle={self.throttle}% | CAN ID: 0x{self.CAN_ID:03X}")
        except can.CanError as e:
            print(f"[ENGINE_ECU] Send failed: {e}")

    def run(self, frequency_hz: float = 10.0):
        """Run the ECU at given frequency (default 10 Hz = every 100ms)."""
        period = 1.0 / frequency_hz
        print(f"[ENGINE_ECU] Starting at {frequency_hz} Hz "
              f"(fault_mode={self.fault_mode})")
        try:
            while True:
                self.send_message()
                time.sleep(period)
        except KeyboardInterrupt:
            print("\n[ENGINE_ECU] Shutting down gracefully")
            self.bus.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Engine ECU Simulator")
    parser.add_argument('--faults', action='store_true',
                        help="Enable random fault injection")
    parser.add_argument('--freq', type=float, default=10.0,
                        help="Transmission frequency in Hz")
    args = parser.parse_args()

    ecu = EngineECU(fault_mode=args.faults)
    ecu.run(frequency_hz=args.freq)
