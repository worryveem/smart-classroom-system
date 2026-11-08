const STORAGE_KEY = 'smartclass.accessToken'
let token = null
try { token = window.sessionStorage.getItem(STORAGE_KEY) } catch { /* Use memory if storage is unavailable. */ }
let snapshot = { token, reason: null }
const listeners = new Set()

export const getAuthSnapshot = () => snapshot
export const getAccessToken = () => snapshot.token
export function subscribeAuth(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function setAccessToken(value) {
  try { window.sessionStorage.setItem(STORAGE_KEY, value) } catch { /* Memory-only session. */ }
  snapshot = { token: value, reason: null }
  listeners.forEach(listener => listener())
}
export function clearAccessToken(reason = 'logout', expectedToken) {
  if (expectedToken !== undefined && expectedToken !== snapshot.token) return
  try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* Storage may be disabled. */ }
  snapshot = { token: null, reason }
  listeners.forEach(listener => listener())
}

// Used only to schedule expiry; identity and permissions always come from /api/auth/me.
export function tokenExpiresAt(value) {
  try {
    if (typeof value !== 'string' || value.length > 8192 || value.split('.').length !== 3) return null
    const payload = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
    return Number.isSafeInteger(exp) && exp > 0 && Number.isSafeInteger(exp * 1000) ? exp * 1000 : null
  } catch { return null }
}
