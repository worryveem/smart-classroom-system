import { formatTime } from '../../../utils/dateTime.js'
import HistoryTableState from './HistoryTableState.jsx'

const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? numberFormatter.format(value) : '—'
export default function TelemetryTable({ rows, loading, invalid, error }) {
  return <div className="history-table-scroll" role="region" aria-label="Bảng lịch sử cảm biến" tabIndex={0} aria-busy={loading}>
    <table className="history-table"><caption className="sr-only">Dữ liệu cảm biến, thời gian mới nhất trước, theo giờ Việt Nam.</caption>
      <thead><tr><th scope="col">Thời gian <span>UTC+07</span></th><th scope="col">Device ID</th><th scope="col" className="number-cell">Nhiệt độ <span>°C</span></th><th scope="col" className="number-cell">Độ ẩm <span>%</span></th><th scope="col" className="number-cell">Ánh sáng <span>Lux</span></th><th scope="col">Trạng thái PIR</th></tr></thead>
      <tbody>{rows.length ? rows.map((row, index) => <tr key={`${row.id}-${index}`}><td className="time-cell">{formatTime(row.timestamp, true)}</td><td><code className="history-device-id">{row.device_id || '—'}</code></td><td className="number-cell">{numeric(row.temp)}</td><td className="number-cell">{numeric(row.humid)}</td><td className="number-cell">{numeric(row.lux)}</td><td><span className={`history-badge ${row.occupancy === true ? 'badge-presence' : 'badge-neutral'}`}>{row.occupancy === true ? 'Có người' : row.occupancy === false ? 'Không có người' : 'Chưa rõ'}</span></td></tr>)
        : <HistoryTableState loading={loading} invalid={invalid} error={error} colSpan={6} />}</tbody>
    </table>
  </div>
}
