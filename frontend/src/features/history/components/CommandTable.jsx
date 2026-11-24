import { UserRound, Workflow } from 'lucide-react'
import { formatTime } from '../../../utils/dateTime.js'
import HistoryTableState from './HistoryTableState.jsx'

export default function CommandTable({ rows, loading, invalid, error }) {
  return <div className="history-table-scroll" role="region" aria-label="Bảng lịch sử điều khiển" tabIndex={0} aria-busy={loading}>
    <table className="history-table"><caption className="sr-only">Lịch sử điều khiển, thời gian mới nhất trước, theo giờ Việt Nam.</caption>
      <thead><tr><th scope="col">Thời gian <span>UTC+07</span></th><th scope="col">Thiết bị</th><th scope="col">Đối tượng</th><th scope="col">Hành động</th><th scope="col">Người thực hiện</th></tr></thead>
      <tbody>{rows.length ? rows.map((row, index) => <tr key={`${row.id}-${index}`}><td className="time-cell">{formatTime(row.timestamp, true)}</td><td><code className="history-device-id">{row.device_id || '—'}</code></td><td><span className="history-target">{row.target || '—'}</span></td><td><span className={`history-badge ${row.action === 'ON' ? 'badge-on' : row.action === 'OFF' ? 'badge-off' : 'badge-neutral'}`}>{row.action || 'Chưa rõ'}</span></td><td><span className={`history-badge ${row.trigger_by === 'RULE_ENGINE' ? 'badge-rule' : 'badge-user'}`}>{row.trigger_by === 'RULE_ENGINE' ? <Workflow size={12} aria-hidden="true" /> : <UserRound size={12} aria-hidden="true" />}{row.trigger_by || 'Chưa rõ'}</span></td></tr>)
        : <HistoryTableState loading={loading} invalid={invalid} error={error} colSpan={5} />}</tbody>
    </table>
  </div>
}
