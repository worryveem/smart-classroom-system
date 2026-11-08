import { api } from '../../../services/api/client.js'
import { timestampMillis } from '../../../utils/dateTime.js'

export const defaultTelemetryFilters = { deviceId: '', from: '', to: '', limit: '100' }
export const defaultCommandFilters = { deviceId: '', target: '', triggerBy: '', from: '', to: '', size: '20', page: 0 }
const withSeconds = value => value.length === 16 ? `${value}:00` : value

export function validateFilters(tab, filters) {
  const errors = {}
  for (const field of ['deviceId', ...(tab === 'commands' ? ['triggerBy'] : [])]) {
    if (filters[field].trim().length > 50) errors[field] = 'Tối đa 50 ký tự.'
  }
  for (const field of ['from', 'to']) {
    if (filters[field] && timestampMillis(withSeconds(filters[field])) === null) errors[field] = 'Thời điểm không hợp lệ.'
  }
  if (!errors.from && !errors.to && filters.from && filters.to && timestampMillis(withSeconds(filters.from)) > timestampMillis(withSeconds(filters.to))) {
    errors.to = 'Thời điểm kết thúc phải bằng hoặc sau thời điểm bắt đầu.'
  }
  const countField = tab === 'telemetry' ? 'limit' : 'size'
  const count = Number(filters[countField]), max = tab === 'telemetry' ? 1000 : 100
  if (!Number.isInteger(count) || count < 1 || count > max) errors[countField] = `Nhập số nguyên từ 1 đến ${max}.`
  return errors
}
export function queryParams(tab, filters) {
  const params = {}
  for (const field of ['deviceId', 'from', 'to', ...(tab === 'commands' ? ['target', 'triggerBy'] : [])]) {
    const value = filters[field].trim()
    if (value) params[field] = field === 'from' || field === 'to' ? withSeconds(value) : value
  }
  if (tab === 'telemetry') params.limit = Number(filters.limit)
  else { params.page = filters.page; params.size = Number(filters.size) }
  return params
}
const malformed = () => Object.assign(new Error('Invalid history response'), { code: 'INVALID_HISTORY' })
const validRows = rows => Array.isArray(rows) && rows.every(row => row && !Array.isArray(row)
  && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.device_id === 'string' && row.device_id.length > 0
  && timestampMillis(row.timestamp) !== null)
export async function fetchHistory(tab, params, signal) {
  const { data: body } = await api.get(tab === 'telemetry' ? '/api/telemetry' : '/api/commands', { params, signal })
  if (body?.success !== true) throw malformed()
  if (tab === 'telemetry') {
    if (!validRows(body.data)) throw malformed()
    return { rows: body.data }
  }
  const page = body.data
  if (!page || !validRows(page.content)
      || !['page', 'size', 'totalElements', 'totalPages'].every(key => Number.isSafeInteger(page[key]) && page[key] >= 0)
      || page.size < 1 || page.page !== params.page || page.size !== params.size) throw malformed()
  return { rows: page.content, page: page.page, size: page.size, totalElements: page.totalElements, totalPages: page.totalPages }
}
export function historyError(error) {
  if (error.code === 'INVALID_HISTORY') return 'Dữ liệu lịch sử trả về chưa đúng cấu trúc. Vui lòng thử lại.'
  if (!error.response) return 'Không kết nối được Backend hoặc yêu cầu đã hết thời gian chờ. Vui lòng kiểm tra kết nối và thử lại.'
  switch (error.response.status) {
    case 400: return 'Backend từ chối bộ lọc. Vui lòng kiểm tra thiết bị, thời gian và giới hạn bản ghi.'
    case 403: return 'Tài khoản không có quyền xem lịch sử này.'
    case 401: return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
    default: return 'Chưa tải được lịch sử từ Backend. Vui lòng thử lại sau.'
  }
}
