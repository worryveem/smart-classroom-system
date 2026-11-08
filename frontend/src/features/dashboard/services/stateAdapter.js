export const SENSOR_ID = import.meta.env.VITE_SENSOR_DEVICE_ID || 'node1_sensor'
export const ACTUATOR_ID = import.meta.env.VITE_ACTUATOR_DEVICE_ID || 'node2_actuator'

export function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
export function binary(value) {
  if ([true, 1, '1', 'ON', 'true'].includes(value)) return true
  if ([false, 0, '0', 'OFF', 'false'].includes(value)) return false
  return null
}
function connection(record) {
  if (!record || typeof record !== 'object') return null
  const direct = binary(record.connected ?? record.online)
  if (direct !== null) return direct
  if (['ONLINE', 'Online', 'online'].includes(record.status)) return true
  if (['OFFLINE', 'Offline', 'offline'].includes(record.status)) return false
  // DB status Active is administrative metadata, not proof that an ESP32 is online.
  return null
}
function recordFor(root, id) {
  const records = Array.isArray(root) ? root : Array.isArray(root?.devices) ? root.devices : []
  const keyed = root?.[id]
  const validKeyed = keyed && typeof keyed === 'object' && !Array.isArray(keyed)
    && (keyed.device_id == null || keyed.device_id === id) ? keyed : null
  return records.find(record => record?.device_id === id) ?? validKeyed ?? (root?.device_id === id ? root : null)
}
export function normalizeState(raw, sensorId = SENSOR_ID, actuatorId = ACTUATOR_ID) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid state payload')
  const root = Array.isArray(raw) ? {} : raw
  // A labelled record belongs only to that device; only an unlabelled flat object can aggregate both.
  const flat = root.device_id == null ? root : {}
  const sensor = recordFor(raw, sensorId) ?? flat
  const actuator = recordFor(raw, actuatorId) ?? flat
  const result = {
    temp: numeric(sensor.temp), humid: numeric(sensor.humid), lux: numeric(sensor.lux), occupancy: binary(sensor.occupancy),
    FAN: binary(actuator.FAN), LIGHT: binary(actuator.LIGHT),
    sensorConnected: connection(recordFor(raw, sensorId)),
    actuatorConnected: connection(recordFor(raw, actuatorId)),
    sensorTimestamp: sensor.timestamp ?? null,
    actuatorTimestamp: actuator.timestamp ?? null,
    auto: binary(actuator.AUTO ?? actuator.auto ?? flat.AUTO ?? flat.auto),
  }
  result.recognized = ['temp', 'humid', 'lux', 'occupancy', 'FAN', 'LIGHT'].some(key => result[key] !== null)
  return result
}
