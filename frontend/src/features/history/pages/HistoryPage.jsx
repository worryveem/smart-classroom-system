import { useRef, useState } from 'react'
import { Activity, AlertCircle, Clock3, ListFilter, RefreshCw, Terminal } from 'lucide-react'
import HistoryFilters from '../components/HistoryFilters.jsx'
import TelemetryTable from '../components/TelemetryTable.jsx'
import CommandTable from '../components/CommandTable.jsx'
import HistoryPagination from '../components/HistoryPagination.jsx'
import { defaultCommandFilters, defaultTelemetryFilters, historyError, queryParams, validateFilters } from '../services/historyService.js'
import { useHistoryQuery } from '../hooks/useHistoryQuery.js'
import { formatTime } from '../../../utils/dateTime.js'
import '../history.css'

export default function HistoryPage() {
  const [tab, setTab] = useState('telemetry')
  const [filters, setFilters] = useState({ telemetry: { ...defaultTelemetryFilters }, commands: { ...defaultCommandFilters } })
  const [revisions, setRevisions] = useState({ telemetry: 0, commands: 0 })
  const tabButtons = useRef([])
  const current = filters[tab]
  const errors = validateFilters(tab, current)
  const valid = Object.keys(errors).length === 0
  const resource = useHistoryQuery(tab, queryParams(tab, current), valid, revisions[tab])
  const rows = resource.data?.rows ?? []
  const telemetry = tab === 'telemetry'
  function change(name, value) {
    setFilters(previous => ({ ...previous, [tab]: { ...previous[tab], [name]: value, ...(tab === 'commands' ? { page: 0 } : {}) } }))
  }
  function reset() { setFilters(previous => ({ ...previous, [tab]: { ...(telemetry ? defaultTelemetryFilters : defaultCommandFilters) } })) }
  function tabKey(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index
    setTab(next === 0 ? 'telemetry' : 'commands')
    tabButtons.current[next]?.focus()
  }
  return <div className="history-page">
    <header className="history-heading"><div><h1>Lịch sử</h1><p>Theo dõi dữ liệu cảm biến và các thao tác điều khiển trong lớp học.</p></div>
      <button className="history-refresh" disabled={resource.loading || !valid} onClick={() => setRevisions(previous => ({ ...previous, [tab]: previous[tab] + 1 }))}><RefreshCw size={16} className={resource.loading ? 'spin' : ''} />Làm mới dữ liệu</button>
    </header>
    <div className="history-tabs" role="tablist" aria-label="Loại lịch sử">{[{ key: 'telemetry', label: 'Lịch sử cảm biến', icon: Activity }, { key: 'commands', label: 'Lịch sử điều khiển', icon: Terminal }].map(({ key, label, icon: Icon }, index) =>
      <button key={key} ref={element => { tabButtons.current[index] = element }} id={`tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => tabKey(event, index)}><Icon size={17} />{label}</button>)}
    </div>
    <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
      <HistoryFilters tab={tab} filters={current} errors={errors} change={change} reset={reset} />
      {resource.error && <div className="history-alert" role="alert"><AlertCircle size={19} /><div><strong>{historyError(resource.error)}</strong>{rows.length > 0 && <p>Đang hiển thị dữ liệu của lần tải trước với cùng bộ lọc.</p>}</div></div>}
      <section className="history-results" aria-label={telemetry ? 'Kết quả cảm biến' : 'Kết quả điều khiển'}>
        <div className="history-result-heading"><div><ListFilter size={16} /><h2>{telemetry ? 'Dữ liệu cảm biến' : 'Nhật ký điều khiển'}</h2>{resource.data && <span className="history-count">{telemetry ? rows.length : resource.data.totalElements} bản ghi{telemetry ? ' đã tải' : ''}</span>}</div>
          <span className="history-loaded" role="status"><Clock3 size={12} />{resource.loading ? 'Đang tải dữ liệu…' : resource.loadedAt ? `Lần tải: ${formatTime(resource.loadedAt)}` : 'Chưa tải dữ liệu'}</span>
        </div>
        {telemetry ? <TelemetryTable rows={rows} loading={resource.loading} invalid={!valid} error={resource.error} /> : <CommandTable rows={rows} loading={resource.loading} invalid={!valid} error={resource.error} />}
        {telemetry ? <footer className="telemetry-result-footer"><span>{rows.length} bản ghi hiển thị · Mới nhất trước</span><span>Tối đa {current.limit || '—'} bản ghi / lần truy vấn</span></footer>
          : <HistoryPagination data={resource.data} loading={resource.loading} setPage={page => setFilters(previous => ({ ...previous, commands: { ...previous.commands, page } }))} />}
      </section>
      {telemetry && valid && resource.data && rows.length >= Number(current.limit) && <p className="history-limit-note">Đã đạt giới hạn {current.limit} bản ghi mới nhất. Hãy thu hẹp bộ lọc hoặc tăng giới hạn (tối đa 1000) để tra cứu phù hợp hơn.</p>}
      <p className="history-bottom-note">Thời gian hiển thị theo Việt Nam · Dữ liệu được truy vấn trực tiếp từ hệ thống, không tự động làm mới nền.</p>
    </section>
  </div>
}
