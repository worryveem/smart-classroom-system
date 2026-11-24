import { Fan, Lightbulb } from 'lucide-react'
import { formatTime } from '../services/dashboardService.js'

export function ConnectionBadge({ connected }) {
  return <span className={`connection-badge ${connected === true ? 'is-online' : connected === false ? 'is-offline' : 'is-unknown'}`}><span />{connected === true ? 'Đang kết nối' : connected === false ? 'Mất kết nối' : 'Chưa rõ kết nối'}</span>
}
export default function DeviceStatus({ target, value, connected, timestamp, stale }) {
  const Icon = target === 'FAN' ? Fan : Lightbulb
  return (
    <div className="device-status">
      <div className={`device-symbol ${value === true && !stale ? 'device-on' : ''}`}><Icon size={27} strokeWidth={1.6} className={target === 'FAN' && value === true && !stale ? 'fan-running' : ''} aria-hidden="true" /></div>
      <div className="device-identity"><h3>{target === 'FAN' ? 'Quạt' : 'Đèn chiếu sáng'} <span>{target}</span></h3><ConnectionBadge connected={connected} /></div>
      <span className={`device-value ${value === true ? 'value-on' : ''}`}>{value === true ? 'ON' : value === false ? 'OFF' : 'Chưa rõ'}</span>
      {timestamp && <p className="device-timestamp">Thời điểm State: {formatTime(timestamp, true)}</p>}
    </div>
  )
}
