export function returnPath(from, role) {
  const fallback = '/dashboard'
  if (typeof from !== 'string') return fallback
  if (/^\/iot(?:[?#]|$)/.test(from) || /^\/iot\/rooms\/[1-9]\d{2,3}(?:[?#]|$)/.test(from)) return from
  if (/^\/(dashboard|history|building|classroom)(?:[?#]|$)/.test(from)) return from
  if (role === 'ADMIN' && /^\/admin(?:[?#]|$)/.test(from)) return from
  return fallback
}
