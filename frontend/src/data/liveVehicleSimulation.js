import { encodeBrakeFrame, encodeEngineFrame, encodeSpeedFrame, formatBytes } from './canProtocol.js'
import { SIM_CARS } from './simulatedNetwork.js'

export const BROWSER_FAULTS = [
  { id: 'rpm_spike', label: 'RPM spike', diagnosis: 'Engine over-rev detected', ecu: 'ENGINE · 0x100' },
  { id: 'brake_failure', label: 'Brake failure', diagnosis: 'Brake failure — pedal pressed but no pressure', ecu: 'BRAKE · 0x200' },
  { id: 'sensor_stuck', label: 'Stuck speed sensor', diagnosis: 'Speed sensor stuck · browser persistence rule', ecu: 'SPEED · 0x300' },
]

export const NORMAL_RANGES = {
  rpm: [800, 3500],
  coolant_temp: [80, 105],
  throttle: [0, 80],
  brake_pressure: [0, 60],
  abs_status: [0, 1],
  pedal_position: [0, 60],
  speed: [0, 120],
  wheel_delta: [-0.5, 0.5],
}

const HISTORY_LIMITS = { frames: 120, scores: 72, alerts: 20, packets: 8 }
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const round = (value, digits = 1) => Number(value.toFixed(digits))
const nowIso = () => new Date().toISOString()
const localTime = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function createInitialVehicle() {
  const speed = 0
  return {
    engine: { rpm: 0, coolant_temp: 0, throttle: 0 },
    brake: { brake_pressure: 0, abs_status: 0, pedal_position: 0 },
    speed: { speed, wheel_fl: speed + 0.2, wheel_fr: speed - 0.2 },
    last_update: nowIso(),
  }
}

export function createInitialMachine() {
  const fleetStates = Object.fromEntries(SIM_CARS.filter((car) => car.id !== 'project').map((car) => [car.id, createInitialVehicle()]))
  const carFaults = Object.fromEntries(SIM_CARS.map((car) => [car.id, null]))
  const carDecisions = Object.fromEntries(SIM_CARS.map((car) => [car.id, { diagnosis: '', score: null, anomalous: false }]))
  return {
    started: false,
    naturalAnomalies: false,
    vehicle: createInitialVehicle(),
    fleetStates,
    carFaults,
    carStuckFrames: {},
    carStuckSpeeds: {},
    carDecisions,
    scoresByCar: Object.fromEntries(SIM_CARS.map((car) => [car.id, []])),
    frames: [],
    scores: [],
    alerts: [],
    pipelinePackets: [],
    simulationTime: 0,
    autoFaultPending: false,
    autoFaultAt: null,
    frameSequence: 0,
    packetCycle: 0,
    stuckFrames: 0,
    stuckSpeed: null,
    fault: null,
    lastAlertKey: null,
    latestDecision: { diagnosis: '', score: null, anomalous: false },
  }
}

function updateVehicle(previous, simulationTime, deltaSeconds) {
  const seconds = simulationTime / 1000
  const brakePhase = seconds % 20
  const braking = brakePhase >= 15 && brakePhase < 17
  const throttle = round(clamp(38 + 20 * Math.sin(seconds * 0.24), 12, 62), 0)
  const pedal = braking ? 48 : 0
  const pressure = braking ? 60 : 0
  // City-route target: 25–70 km/h, with a 20 km/h rolling floor after start.
  const desiredSpeed = 25 + 45 * (0.5 + 0.5 * Math.sin(seconds * 0.11))
  const acceleration = (desiredSpeed - previous.speed.speed) * 0.24 - (braking ? 2.4 : 0)
  const startupFloor = clamp((seconds / 2.5) * 20, 0, 20)
  const speed = round(clamp(previous.speed.speed + acceleration * deltaSeconds, startupFloor, 108))
  const rpm = round(clamp(820 + speed * 22 + throttle * 8 + 55 * Math.sin(seconds * 0.62), 800, 3500), 0)
  const coolant = round(clamp(86 + 2.2 * Math.sin(seconds * 0.018), 80, 105))
  const wheelNoise = 0.32 * Math.sin(seconds * 1.7)
  const otherWheelNoise = 0.32 * Math.cos(seconds * 1.4)

  return {
    engine: { rpm, coolant_temp: coolant, throttle },
    brake: { brake_pressure: pressure, abs_status: pressure > 70 ? 1 : 0, pedal_position: pedal },
    speed: {
      speed,
      wheel_fl: round(speed + wheelNoise),
      wheel_fr: round(speed + otherWheelNoise),
    },
    last_update: nowIso(),
  }
}

function updateFleetVehicle(previous, simulationTime, deltaSeconds, seed) {
  const seconds = simulationTime / 1000
  const phase = seed * 1.7
  const braking = (seconds + seed * 2) % 19 > 14.5 && (seconds + seed * 2) % 19 < 16.4
  const target = 34 + 23 * (0.5 + 0.5 * Math.sin(seconds * .095 + phase))
  const throttle = Math.round(clamp(35 + 23 * Math.sin(seconds * .21 + phase), 10, 68))
  const speed = round(clamp(previous.speed.speed + ((target - previous.speed.speed) * .19 - (braking ? 2.1 : 0)) * deltaSeconds, 0, 88))
  const pressure = braking ? 56 : 0
  return {
    engine: { rpm: Math.round(clamp(860 + speed * 23 + throttle * 7, 800, 3500)), coolant_temp: round(85 + seed + Math.sin(seconds * .016 + phase)), throttle },
    brake: { brake_pressure: pressure, abs_status: 0, pedal_position: braking ? 48 : 0 },
    speed: { speed, wheel_fl: round(speed + .3 * Math.sin(seconds * 1.5 + phase)), wheel_fr: round(speed + .3 * Math.cos(seconds * 1.3 + phase)) },
    last_update: nowIso(),
  }
}

function applyFault(vehicle, fault, stuckSpeed) {
  const state = structuredClone(vehicle)
  if (fault === 'rpm_spike') {
    state.engine.rpm = 8240
    state.engine.throttle = 96
  }
  if (fault === 'brake_failure') {
    state.brake.brake_pressure = 0
    state.brake.pedal_position = 80
  }
  if (fault === 'sensor_stuck') {
    const held = Number.isFinite(stuckSpeed) ? stuckSpeed : state.speed.speed
    state.speed.speed = held
    state.speed.wheel_fl = held
    state.speed.wheel_fr = held
  }
  return state
}

function makeFrames(vehicle, sequence, fault, carId = 'project') {
  const createdAt = nowIso()
  const time = localTime(createdAt)
  const definitions = [
    { ecu: 'ENGINE', canId: '0x100', bytes: encodeEngineFrame({ rpm: vehicle.engine.rpm, coolant: vehicle.engine.coolant_temp, throttle: vehicle.engine.throttle }) },
    { ecu: 'BRAKE', canId: '0x200', bytes: encodeBrakeFrame({ pressure: vehicle.brake.brake_pressure, abs: vehicle.brake.abs_status, pedal: vehicle.brake.pedal_position }) },
    { ecu: 'SPEED', canId: '0x300', bytes: encodeSpeedFrame({ speed: vehicle.speed.speed, wheelFl: vehicle.speed.wheel_fl, wheelFr: vehicle.speed.wheel_fr }) },
  ]
  return definitions.map((frame, index) => ({
    id: `browser-${sequence + index}`,
    sequence: sequence + index,
    createdAt,
    time,
    ecu: frame.ecu,
    canId: frame.canId,
    dlc: 8,
    bytes: formatBytes(frame.bytes),
    fault,
    carId,
  }))
}

function rangeDeviation(value, [min, max]) {
  const halfRange = (max - min) / 2 || 1
  if (value < min) return (min - value) / halfRange
  if (value > max) return (value - max) / halfRange
  return Math.abs(value - (min + max) / 2) / halfRange
}

export function detectBrowserAnomaly(vehicle, stuckFrames) {
  const engine = vehicle.engine
  const brake = vehicle.brake
  const speed = vehicle.speed
  const wheelDelta = Math.abs(speed.wheel_fl - speed.wheel_fr)
  let finding = null

  // These explicit fault cutoffs match dashboard/api.py. The held-speed rule is
  // a browser-only persistence check because the Python API has no stuck-sensor rule.
  if (engine.rpm > 7000) finding = { diagnosis: 'Engine over-rev detected', ecu: 'ENGINE', signal: 'RPM', value: engine.rpm }
  else if (engine.coolant_temp > 115) finding = { diagnosis: 'Engine overheating', ecu: 'ENGINE', signal: 'Coolant temperature', value: engine.coolant_temp }
  else if (brake.pedal_position > 50 && brake.brake_pressure < 5) finding = { diagnosis: 'Brake failure — pedal pressed but no pressure', ecu: 'BRAKE', signal: 'Brake pressure', value: brake.brake_pressure }
  else if (wheelDelta > 15) finding = { diagnosis: 'Wheel speed mismatch', ecu: 'SPEED', signal: 'Front wheel delta', value: round(wheelDelta) }
  else if (speed.speed > 200) finding = { diagnosis: 'Impossible speed reading', ecu: 'SPEED', signal: 'Vehicle speed', value: speed.speed }
  else if (brake.brake_pressure > 180) finding = { diagnosis: 'Brake pressure spike', ecu: 'BRAKE', signal: 'Brake pressure', value: brake.brake_pressure }
  else if (stuckFrames >= 10) finding = { diagnosis: 'Speed sensor stuck · browser persistence rule', ecu: 'SPEED', signal: 'Vehicle speed', value: speed.speed }

  const ranges = [
    [engine.rpm, NORMAL_RANGES.rpm],
    [engine.coolant_temp, NORMAL_RANGES.coolant_temp],
    [engine.throttle, NORMAL_RANGES.throttle],
    [brake.brake_pressure, NORMAL_RANGES.brake_pressure],
    [brake.abs_status, NORMAL_RANGES.abs_status],
    [brake.pedal_position, NORMAL_RANGES.pedal_position],
    [speed.speed, NORMAL_RANGES.speed],
    [speed.wheel_fl - speed.speed, NORMAL_RANGES.wheel_delta],
    [speed.wheel_fr - speed.speed, NORMAL_RANGES.wheel_delta],
  ]
  const deviation = Math.max(...ranges.map(([value, range]) => rangeDeviation(value, range)))
  if (!finding) {
    const outside = [
      ['ENGINE', 'RPM', engine.rpm, NORMAL_RANGES.rpm], ['ENGINE', 'Coolant temperature', engine.coolant_temp, NORMAL_RANGES.coolant_temp], ['ENGINE', 'Throttle', engine.throttle, NORMAL_RANGES.throttle],
      ['BRAKE', 'Brake pressure', brake.brake_pressure, NORMAL_RANGES.brake_pressure], ['BRAKE', 'Pedal position', brake.pedal_position, NORMAL_RANGES.pedal_position],
      ['SPEED', 'Vehicle speed', speed.speed, NORMAL_RANGES.speed],
    ].find(([, , value, [min, max]]) => value < min || value > max)
    if (outside) finding = { diagnosis: 'Outside training normal range', ecu: outside[0], signal: outside[1], value: outside[2] }
  }
  // This browser score is a transparent rule proxy, not Isolation Forest output.
  // Its threshold is zero: a flagged reading must score below that boundary.
  const score = finding ? -round(0.12 + Math.min(0.78, deviation * 0.22), 3) : round(0.04 + (1 - Math.min(1, deviation)) * 0.22, 3)
  const anomalous = score < 0
  return { ...(anomalous ? finding : {}), diagnosis: anomalous ? finding?.diagnosis : '', score, threshold: 0, anomalous }
}

export function advanceMachine(machine, deltaMs) {
  if (!machine.started) return machine
  const simulationTime = machine.simulationTime + deltaMs
  const autoFaultFires = machine.autoFaultPending && simulationTime >= machine.autoFaultAt
  const activeFault = autoFaultFires ? 'rpm_spike' : machine.fault
  const autoFaultPending = autoFaultFires ? false : machine.autoFaultPending
  const baseline = updateVehicle(machine.vehicle, simulationTime, deltaMs / 1000)
  const stuckFrames = activeFault === 'sensor_stuck' ? machine.stuckFrames + 1 : 0
  const vehicle = applyFault(baseline, activeFault, machine.stuckSpeed)
  let naturalGlitch = null
  if (machine.naturalAnomalies && Math.random() < 0.0012) {
    naturalGlitch = { carId: SIM_CARS[Math.floor(Math.random() * SIM_CARS.length)].id, rpm: Math.round(3300 + Math.random() * 600) }
  }
  if (naturalGlitch?.carId === 'project') vehicle.engine.rpm = naturalGlitch.rpm
  const frames = makeFrames(vehicle, machine.frameSequence, activeFault, 'project')
  const decision = detectBrowserAnomaly(vehicle, stuckFrames)
  const timestamp = nowIso()
  const scorePoint = { time: localTime(timestamp), score: decision.score }
  let alerts = machine.alerts
  if (decision.diagnosis && decision.diagnosis !== machine.lastAlertKey) {
    alerts = [{ timestamp, diagnosis: decision.diagnosis, ecu: decision.ecu, signal: decision.signal, value: decision.value, score: decision.score, simulated: true, method: 'simulated detector', carId: 'project' }, ...alerts].slice(0, HISTORY_LIMITS.alerts)
  }

  const fleetStates = { ...machine.fleetStates }
  const carFaults = { ...machine.carFaults, project: activeFault }
  const carStuckFrames = { ...machine.carStuckFrames }
  const carStuckSpeeds = { ...machine.carStuckSpeeds }
  const carDecisions = { ...machine.carDecisions, project: decision }
  const scoresByCar = { ...machine.scoresByCar, project: [...machine.scores, scorePoint].slice(-HISTORY_LIMITS.scores) }
  const fleetFrames = []
  SIM_CARS.filter((car) => car.id !== 'project').forEach((car, index) => {
    const fault = carFaults[car.id]
    const baseline = updateFleetVehicle(fleetStates[car.id], simulationTime, deltaMs / 1000, index + 1)
    const nextStuckFrames = fault === 'sensor_stuck' ? (carStuckFrames[car.id] || 0) + 1 : 0
    const nextVehicle = applyFault(baseline, fault, carStuckSpeeds[car.id])
    if (naturalGlitch?.carId === car.id) nextVehicle.engine.rpm = naturalGlitch.rpm
    fleetStates[car.id] = nextVehicle
    carStuckFrames[car.id] = nextStuckFrames
    carStuckSpeeds[car.id] = fault === 'sensor_stuck' ? (carStuckSpeeds[car.id] ?? machine.fleetStates[car.id].speed.speed) : null
    const carDecision = detectBrowserAnomaly(nextVehicle, nextStuckFrames)
    carDecisions[car.id] = carDecision
    const previous = scoresByCar[car.id] || []
    scoresByCar[car.id] = [...previous, { time: localTime(timestamp), score: carDecision.score }].slice(-HISTORY_LIMITS.scores)
    if (carDecision.diagnosis && carDecision.diagnosis !== machine.carDecisions[car.id]?.diagnosis) {
      alerts = [{ timestamp, diagnosis: carDecision.diagnosis, ecu: carDecision.ecu, signal: carDecision.signal, value: carDecision.value, score: carDecision.score, simulated: true, method: naturalGlitch?.carId === car.id ? 'natural simulated glitch' : 'simulated detector', carId: car.id }, ...alerts].slice(0, HISTORY_LIMITS.alerts)
    }
    fleetFrames.push(...makeFrames(nextVehicle, machine.frameSequence + frames.length + fleetFrames.length, fault, car.id))
  })

  const cycle = Math.floor(simulationTime / 1000)
  let pipelinePackets = machine.pipelinePackets.filter((packet) => simulationTime - packet.createdAtSimulationTime < 8000)
  let packetCycle = machine.packetCycle
  if (cycle > machine.packetCycle) {
    const packet = frames[(cycle - 1) % frames.length]
    pipelinePackets = [...pipelinePackets, { ...packet, createdAtSimulationTime: simulationTime, anomalous: decision.anomalous, diagnosis: decision.diagnosis }].slice(-HISTORY_LIMITS.packets)
    packetCycle = cycle
  }

  return {
    ...machine,
    vehicle,
    fleetStates,
    carFaults,
    carStuckFrames,
    carStuckSpeeds,
    carDecisions,
    scoresByCar,
    frames: [...frames, ...fleetFrames, ...machine.frames].slice(0, HISTORY_LIMITS.frames),
    scores: [...machine.scores, scorePoint].slice(-HISTORY_LIMITS.scores),
    alerts,
    pipelinePackets,
    simulationTime,
    autoFaultPending,
    autoFaultAt: autoFaultPending ? machine.autoFaultAt : null,
    fault: activeFault,
    frameSequence: machine.frameSequence + frames.length + fleetFrames.length,
    packetCycle,
    stuckFrames,
    stuckSpeed: activeFault === 'sensor_stuck' ? machine.stuckSpeed ?? machine.vehicle.speed.speed : null,
    lastAlertKey: decision.diagnosis || null,
    latestDecision: decision,
  }
}

export { HISTORY_LIMITS }
