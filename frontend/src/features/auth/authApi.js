import { api } from '../../services/api/client.js'
import { tokenExpiresAt } from './authSession.js'

const roles = ['ADMIN', 'TEACHER', 'STUDENT']
export function validateUser(user) {
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.username !== 'string'
      || !user.username || !roles.includes(user.role)) throw new Error('Invalid authentication response')
  return { id: user.id, username: user.username, role: user.role }
}
export async function signInRequest(username, password, signal) {
  const { data: body } = await api.post('/api/auth/login', { username, password }, { skipAuth: true, signal })
  const data = body?.data
  if (body?.success !== true || data?.tokenType !== 'Bearer' || !Number.isFinite(data.expiresIn)
      || data.expiresIn <= 0 || !tokenExpiresAt(data.accessToken)) throw new Error('Invalid authentication response')
  validateUser(data.user)
  return data.accessToken
}
export async function currentUserRequest(signal) {
  const { data: body } = await api.get('/api/auth/me', { signal })
  if (body?.success !== true) throw new Error('Invalid authentication response')
  return validateUser(body.data)
}
