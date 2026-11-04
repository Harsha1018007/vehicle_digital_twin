export const FAULTS = [
  {
    id: 'none', label: 'Normal traffic', ecu: 'All ECUs', reading: 'Within the simulated operating range',
    alert: 'No injected fault. The sample frame follows the normal path.',
  },
  {
    id: 'rpm_spike', label: 'Engine over-rev', ecu: 'Engine ECU · 0x100', reading: 'RPM jumps above 7,000',
    alert: 'Engine over-rev detected',
  },
  {
    id: 'overheat', label: 'Engine overheating', ecu: 'Engine ECU · 0x100', reading: 'Coolant temperature rises above 115 °C',
    alert: 'Engine overheating',
  },
  {
    id: 'brake_failure', label: 'Brake pressure loss', ecu: 'Brake ECU · 0x200', reading: 'Pedal pressed; pressure stays near zero',
    alert: 'Brake failure — pedal pressed but no pressure',
  },
  {
    id: 'wheel_mismatch', label: 'Wheel speed mismatch', ecu: 'Speed ECU · 0x300', reading: 'Front wheel readings diverge by more than 15 km/h',
    alert: 'Wheel speed mismatch',
  },
  {
    id: 'impossible_speed', label: 'Impossible speed reading', ecu: 'Speed ECU · 0x300', reading: 'Vehicle speed rises above 200 km/h',
    alert: 'Impossible speed reading',
  },
  {
    id: 'pressure_spike', label: 'Brake pressure spike', ecu: 'Brake ECU · 0x200', reading: 'Brake pressure rises above 180 bar',
    alert: 'Brake pressure spike',
  },
  {
    id: 'sensor_stuck', label: 'Speed sensor stuck', ecu: 'Speed ECU · 0x300', reading: 'Speed repeats for 10 messages',
    alert: 'The current detector does not explicitly diagnose a constant stuck value.',
  },
]

export function faultReading(fault) {
  switch (fault) {
    case 'rpm_spike': return '8,240 rpm'
    case 'overheat': return 'Coolant 121 °C'
    case 'brake_failure': return 'Pedal 80% · pressure 0.0 bar'
    case 'wheel_mismatch': return 'Left 92.0 · right 42.0 km/h'
    case 'sensor_stuck': return 'Speed repeated · frame 6 of 10'
    case 'impossible_speed': return '225 km/h'
    case 'pressure_spike': return '210 bar · pedal 90%'
    default: return '2,400 rpm · 85.0 °C · throttle 20%'
  }
}
