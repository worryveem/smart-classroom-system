export function timestampMillis(value) {
  if (typeof value !== 'string') return null
  const normalized = value.replace(' ', 'T')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(normalized)) return null
  const millis = Date.parse(/[Zz]$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}+07:00`)
  return Number.isFinite(millis) ? millis : null
}

export function formatTime(value, full = false) {
  const millis = typeof value === 'number' ? value : timestampMillis(value)
  if (millis === null || !Number.isFinite(millis)) return 'Chưa có thời điểm'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit',
    ...(full ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
  }).format(millis)
}
