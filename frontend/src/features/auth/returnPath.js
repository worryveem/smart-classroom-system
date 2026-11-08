export function returnPath(from, role) {
  if (typeof from !== 'string') return '/dashboard'
  if (/^\/(dashboard|history)(?:[?#]|$)/.test(from)) return from
  if (role === 'ADMIN' && /^\/admin(?:[?#]|$)/.test(from)) return from
  return '/dashboard'
}
