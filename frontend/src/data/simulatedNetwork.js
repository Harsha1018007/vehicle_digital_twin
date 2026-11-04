import { encodeBrakeFrame, encodeEngineFrame, encodeSpeedFrame, formatBytes } from './canProtocol.js'

export const SIM_CARS = [
  { id: 'project', callsign: 'CAN TESTER', name: 'Project vehicle', kind: 'test', x: 25, y: 56, direction: 'east' },
  { id: 'fleet-02', callsign: 'SIM 02', name: 'Vehicle 02', kind: 'simulated', x: 54, y: 31, direction: 'north' },
  { id: 'fleet-03', callsign: 'SIM 03', name: 'Vehicle 03', kind: 'simulated', x: 78, y: 69, direction: 'west' },
  { id: 'fleet-04', callsign: 'SIM 04', name: 'Vehicle 04', kind: 'simulated', x: 64, y: 83, direction: 'south' },
]

const round = (number, digits = 1) => Number(number.toFixed(digits))
const jitter = (magnitude) => (Math.random() - .5) * magnitude
const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function createVehicleState(seed = 0) {
  return {
    engine: { rpm: 1800 + seed * 280, coolant_temp: 86 + seed * 1.3, throttle: 22 + seed * 7 },
    brake: { brake_pressure: seed % 2 ? 24 : 0, abs_status: 0, pedal_position: seed % 2 ? 20 : 0 },
    speed: { speed: 38 + seed * 14, wheel_fl: 38 + seed * 14.2, wheel_fr: 38 + seed * 13.8 },
    last_update: new Date().toISOString(),
  }
}

export function applyFault(state, faultId) {
  const result = structuredClone(state)
  if (faultId === 'rpm_spike') result.engine.rpm = 8240
  if (faultId === 'overheat') result.engine.coolant_temp = 121
  if (faultId === 'brake_failure') {
    result.speed.speed = 73
    result.brake.brake_pressure = 0
    result.brake.pedal_position = 80
    result.brake.abs_status = 0
  }
  if (faultId === 'wheel_mismatch') {
    result.speed.speed = 67
    result.speed.wheel_fl = 92
    result.speed.wheel_fr = 42
  }
  if (faultId === 'sensor_stuck') result.speed.speed = 54
  if (faultId === 'impossible_speed') result.speed.speed = 225
  if (faultId === 'pressure_spike') {
    result.brake.brake_pressure = 210
    result.brake.pedal_position = 90
  }
  return result
}

export function applyManualReadings(state, readings) {
  const result = structuredClone(state)
  result.engine.rpm = Number(readings.rpm)
  result.engine.coolant_temp = Number(readings.coolant_temp)
  result.engine.throttle = Number(readings.throttle)
  result.brake.brake_pressure = Number(readings.brake_pressure)
  result.brake.pedal_position = Number(readings.pedal_position)
  result.brake.abs_status = Number(readings.abs_status)
  result.speed.speed = Number(readings.speed)
  result.speed.wheel_fl = Number(readings.wheel_fl)
  result.speed.wheel_fr = Number(readings.wheel_fr)
  return result
}

export function diagnosisForFault(faultId) {
  return ({
    rpm_spike: 'Engine over-rev detected',
    overheat: 'Engine overheating',
    brake_failure: 'Brake failure — pedal pressed but no pressure',
    wheel_mismatch: 'Wheel speed mismatch',
    sensor_stuck: 'Stuck speed is not explicitly diagnosed by the current API rules',
    impossible_speed: 'Impossible speed reading',
    pressure_spike: 'Brake pressure spike',
  })[faultId] || ''
}

export function advanceSimulatedState(state, faultId) {
  const next = structuredClone(state)
  next.engine.rpm = Math.max(800, Math.min(3500, round(next.engine.rpm + jitter(160), 0)))
  next.engine.coolant_temp = round(Math.max(80, Math.min(105, next.engine.coolant_temp + jitter(.45))))
  next.engine.throttle = Math.max(0, Math.min(100, round(next.engine.throttle + jitter(8), 0)))
  next.speed.speed = round(Math.max(0, Math.min(120, next.speed.speed + jitter(2.6))))
  next.speed.wheel_fl = round(next.speed.speed + jitter(.6))
  next.speed.wheel_fr = round(next.speed.speed + jitter(.6))
  if (Math.random() < .2) {
    next.brake.pedal_position = Math.round(20 + Math.random() * 60)
    next.brake.brake_pressure = round(next.brake.pedal_position * 1.2)
    next.brake.abs_status = next.brake.brake_pressure > 70 ? 1 : 0
  } else {
    next.brake.pedal_position = 0
    next.brake.brake_pressure = 0
    next.brake.abs_status = 0
  }
  next.last_update = new Date().toISOString()
  return applyFault(next, faultId)
}

export function makeSimulatedFrame(state, index) {
  const ecu = ['ENGINE', 'BRAKE', 'SPEED'][index % 3]
  const id = { ENGINE: '0x100', BRAKE: '0x200', SPEED: '0x300' }[ecu]
  const bytes = {
    ENGINE: encodeEngineFrame({ rpm: state.engine.rpm, coolant: state.engine.coolant_temp, throttle: state.engine.throttle }),
    BRAKE: encodeBrakeFrame({ pressure: state.brake.brake_pressure, abs: state.brake.abs_status, pedal: state.brake.pedal_position }),
    SPEED: encodeSpeedFrame({ speed: state.speed.speed, wheelFl: state.speed.wheel_fl, wheelFr: state.speed.wheel_fr }),
  }[ecu]
  return { id: `${index}-${Date.now()}`, time: stamp(), ecu, canId: id, dlc: 8, bytes: formatBytes(bytes) }
}

export function makeSimulatedScore(faultId) {
  const base = .1 + Math.random() * .17
  return { time: stamp(), score: faultId === 'none' ? base : -(.06 + Math.random() * .2) }
}
