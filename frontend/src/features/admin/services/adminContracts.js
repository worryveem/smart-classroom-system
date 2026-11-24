import { timestampMillis } from '../../../utils/dateTime.js'

export const roles = ['ADMIN', 'TEACHER', 'STUDENT']
export const types = ['SENSOR', 'ACTUATOR']
export const statuses = ['ACTIVE', 'OFFLINE', 'SUSPENDED']
export const statusLabels = { ACTIVE: 'Active', OFFLINE: 'Offline', SUSPENDED: 'Suspended' }
export function invalidResponse() { return Object.assign(new Error('Invalid admin response'), { code: 'INVALID_ADMIN_RESPONSE' }) }
export function userDTO(row) {
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.username !== 'string' || !roles.includes(row.role) || timestampMillis(row.created_at) === null) throw invalidResponse()
  return { id: row.id, username: row.username, role: row.role, created_at: row.created_at }
}
export function deviceDTO(row) {
  if (!row || typeof row.device_id !== 'string' || !Number.isInteger(row.room_id) || !types.includes(row.type) || !statuses.includes(row.status) || timestampMillis(row.created_at) === null) throw invalidResponse()
  return { device_id: row.device_id, room_id: row.room_id, type: row.type, status: row.status, mac_address: row.mac_address, created_at: row.created_at }
}
export function unwrap(body, map) {
  if (body?.success !== true) throw invalidResponse()
  return map(body.data)
}
export function pageDTO(body, params, map) {
  return unwrap(body, page => {
    if (!page || !Array.isArray(page.content) || !['page', 'size', 'totalElements', 'totalPages'].every(key => Number.isSafeInteger(page[key]) && page[key] >= 0)
        || page.page !== params.page || page.size !== params.size) throw invalidResponse()
    return { rows: page.content.map(map), page: page.page, size: page.size, totalElements: page.totalElements, totalPages: page.totalPages }
  })
}
