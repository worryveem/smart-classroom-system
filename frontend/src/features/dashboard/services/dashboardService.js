import { api } from '../../../services/api/client.js'
import { ACTUATOR_ID, normalizeState, numeric, SENSOR_ID } from './stateAdapter.js'
import { timestampMillis } from '../../../utils/dateTime.js'
export { formatTime, timestampMillis } from '../../../utils/dateTime.js'
export async function fetchDeviceState(signal, scope) {
  const response = await api.get(scope ? `/api/iot/rooms/${scope.roomId}/state` : '/api/state', { signal, timeout: 22000 })
  try {
    if (response.data?.success !== true) throw new Error('Invalid state response')
    return normalizeState(response.data.data, scope?.sensorId, scope?.actuatorId)
  } catch { throw Object.assign(new Error('Invalid state response'), { code: 'INVALID_PAYLOAD' }) }
}
const hours = { '1h': 1, '6h': 6, '24h': 24 }
const vietnamLocal = millis => new Date(millis + 7 * 3600000).toISOString().slice(0, 19)
export async function fetchTelemetry(range, signal, scope) {
  const sensorId = scope?.sensorId || SENSOR_ID
  const params = { ...(!scope ? { deviceId: sensorId } : {}), limit: range === 'recent' ? 50 : 500 }
  if (hours[range]) {
    const now = Date.now()
    params.from = vietnamLocal(now - hours[range] * 3600000)
    params.to = vietnamLocal(now)
  }
  const { data: body } = await api.get(scope ? `/api/iot/rooms/${scope.roomId}/telemetry` : '/api/telemetry', { params, signal })
  if (body?.success !== true || !Array.isArray(body.data)) throw Object.assign(new Error('Invalid telemetry response'), { code: 'INVALID_PAYLOAD' })
  const rows = body.data.filter(row => row?.device_id === sensorId).map(row => ({
    id: row.id, time: timestampMillis(row.timestamp), timestamp: row.timestamp,
    temp: numeric(row.temp), humid: numeric(row.humid), lux: numeric(row.lux),
  }))
  const valid = rows.filter(row => row.time !== null && [row.temp, row.humid, row.lux].some(value => value !== null))
    .sort((a, b) => a.time - b.time || a.id - b.id)
  return { rows: valid, omitted: body.data.length - valid.length, limited: body.data.length >= params.limit }
}
export async function sendCommand(target, action, signal, scope) {
  // No retries: a timeout does not establish whether the device executed a command.
  return api.post(scope ? `/api/iot/rooms/${scope.roomId}/control` : '/api/control', { target, action }, { signal, timeout: 25000 })
}
export function stateError(error) {
  if (error.code === 'INVALID_PAYLOAD') return 'Dữ liệu trả về chưa đúng cấu trúc được hỗ trợ.'
  if (!error.response) return 'Không kết nối được Backend hoặc yêu cầu đã hết thời gian chờ.'
  switch (error.response.status) {
    case 403: return 'Tài khoản không có quyền truy cập dữ liệu này.'
    case 409: return error.response?.data?.message || 'Phòng chưa có cấu hình IoT hợp lệ.'
    case 502: return 'Hệ thống IoT trả dữ liệu không hợp lệ.'
    case 503: return 'Chưa kết nối được Node-RED. Đang chờ khôi phục kết nối.'
    case 504: return 'Hết thời gian chờ phản hồi từ thiết bị.'
    default: return 'Chưa tải được dữ liệu. Hệ thống sẽ thử đọc lại.'
  }
}
export function commandOutcome(body, target, action, httpError = false, actuatorId = ACTUATOR_ID) {
  const data = body?.data
  const sameCommand = data?.target === target && data?.action === action
  if (sameCommand && typeof data?.device_id === 'string' && data.device_id !== actuatorId) {
    return { status: 'UNCONFIRMED', tone: 'warning', message: 'Phản hồi thuộc thiết bị khác với cấu hình Dashboard. Chưa thể xác nhận kết quả cho thiết bị đang hiển thị. Kiểm tra cấu hình và trạng thái, không tự gửi lại lệnh.' }
  }
  const matched = sameCommand && data?.device_id === actuatorId
  if (matched && ['SUCCESS', 'ACCEPTED'].includes(data.status) && (body.success === true || data.log_status === 'FAILED')) {
    const logFailed = data.log_status === 'FAILED'
    return {
      status: data.status, tone: logFailed || data.status === 'ACCEPTED' ? 'warning' : 'success',
      message: `${data.status === 'SUCCESS' ? 'Thiết bị đã xác nhận thực thi lệnh.' : 'Lệnh đã được tiếp nhận, chưa xác nhận thiết bị thực thi.'}${logFailed ? ' Không lưu được lịch sử. Không gửi lại lệnh để sửa lỗi này.' : ''}`,
    }
  }
  if (matched && data.status === 'FAILURE') return { status: 'FAILURE', tone: 'error', message: 'Lệnh không được xác nhận thành công. Kiểm tra trạng thái trước khi quyết định gửi lại.' }
  if (matched && data.status === 'TIMEOUT') return { status: 'TIMEOUT', tone: 'warning', message: 'Hết thời gian chờ; chưa xác định lệnh đã thực thi hay chưa. Không tự gửi lại.' }
  return { status: 'UNCONFIRMED', tone: 'warning', message: httpError ? 'Mất phản hồi hoặc lỗi hệ thống. Lệnh có thể đã được gửi; kiểm tra trạng thái trước khi gửi lại.' : 'Phản hồi chưa đủ để xác nhận kết quả. Kiểm tra trạng thái thiết bị, không tự gửi lại.' }
}
