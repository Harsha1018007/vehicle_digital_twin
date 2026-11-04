export const ENGINE_FRAME = {
  arbitrationId: '0x100',
  dlc: 8,
  signals: [
    { name: 'RPM', bytes: '0–1', scale: 'uint16, big-endian', example: '2400 rpm' },
    { name: 'Coolant temperature', bytes: '2–3', scale: 'uint16 ÷ 10', example: '85.0 °C' },
    { name: 'Throttle', bytes: '4', scale: 'uint8', example: '20 %' },
    { name: 'Reserved', bytes: '5–7', scale: 'zero-filled', example: '—' },
  ],
}

export function encodeEngineFrame({ rpm = 2400, coolant = 85, throttle = 20 } = {}) {
  const scaled = [rpm, Math.round(coolant * 10), throttle, 0, 0, 0]
  return [scaled[0] >> 8, scaled[0] & 255, scaled[1] >> 8, scaled[1] & 255, ...scaled.slice(2)]
}

export function decodeEngineFrame(bytes) {
  return {
    rpm: (bytes[0] << 8) | bytes[1],
    coolant: ((bytes[2] << 8) | bytes[3]) / 10,
    throttle: bytes[4],
  }
}

export function encodeBrakeFrame({ pressure = 0, abs = 0, pedal = 0 } = {}) {
  const scaled = Math.round(pressure * 10)
  return [scaled >> 8, scaled & 255, abs & 255, pedal & 255, 0, 0, 0, 0]
}

export function encodeSpeedFrame({ speed = 0, wheelFl = speed, wheelFr = speed } = {}) {
  const values = [speed, wheelFl, wheelFr].map((value) => Math.max(0, Math.round(value * 10)))
  return [values[0] >> 8, values[0] & 255, values[1] >> 8, values[1] & 255, values[2] >> 8, values[2] & 255, 0, 0]
}

export function formatBytes(bytes) {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
}

export const SAMPLE_BYTES = encodeEngineFrame()
