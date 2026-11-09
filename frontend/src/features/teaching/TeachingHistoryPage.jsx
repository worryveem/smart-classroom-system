import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, RefreshCw, Search } from 'lucide-react'
import { api } from '../../services/api/client.js'
import { formatTime, timestampMillis } from '../../utils/dateTime.js'
import BookingEditModal from '../classroom/BookingEditModal.jsx'
import Modal from '../../components/common/Modal.jsx'
import '../notifications/notifications.css'
import '../classroom/classroom.css'
import './teaching.css'

const labels = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn' }
const defaults = { period: 'ALL', status: '', roomId: '', from: '', to: '' }
const message = e => e.response?.data?.message || 'Chưa kết nối được hệ thống. Vui lòng thử lại.'
export default function TeachingHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams(), selectedId = searchParams.get('bookingId')
  const [draft, setDraft] = useState(defaults), [filters, setFilters] = useState(defaults), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [rooms, setRooms] = useState([]), [resource, setResource] = useState({ loading: true, data: null, error: '' })
  const [detail, setDetail] = useState({ loading: false, data: null, error: '' }), [editing, setEditing] = useState(null), [cancelling, setCancelling] = useState(null)
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [report, setReport] = useState(null), [filterError, setFilterError] = useState('')
  const running = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    api.get('/api/building/rooms', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted && Array.isArray(data.data)) setRooms(data.data) }).catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setResource({ loading: true, data: null, error: '' })
    const params = { page, size: 10, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')) }
    api.get('/api/teaching/bookings', { signal: controller.signal, params }).then(({ data }) => {
      if (!data?.success || !Array.isArray(data.data?.rows) || !Number.isInteger(data.data?.totalPages)) throw new Error('Invalid personal history')
      if (!controller.signal.aborted) setResource({ loading: false, data: data.data, error: '' })
    }).catch(e => { if (!controller.signal.aborted) setResource({ loading: false, data: null, error: message(e) }) })
    return () => controller.abort()
  }, [filters, page, revision])
  useEffect(() => {
    if (resource.data && page > 0 && page >= resource.data.totalPages) setPage(Math.max(0, resource.data.totalPages-1))
  }, [resource.data, page])
  useEffect(() => {
    const controller = new AbortController(); setReport(null); setActionError(''); setEditing(null); setCancelling(null)
    if (!selectedId) { setDetail({ loading: false, data: null, error: '' }); return () => controller.abort() }
    if (!/^[1-9]\d{0,18}$/.test(selectedId)) { setDetail({ loading: false, data: null, error: 'Mã lịch không hợp lệ.' }); return () => controller.abort() }
    setDetail({ loading: true, data: null, error: '' })
    api.get(`/api/teaching/bookings/${selectedId}`, { signal: controller.signal }).then(({ data }) => {
      if (!data?.success || !data.data?.id) throw new Error('Invalid personal booking')
      if (!controller.signal.aborted) setDetail({ loading: false, data: data.data, error: '' })
    }).catch(e => { if (!controller.signal.aborted) setDetail({ loading: false, data: null, error: message(e) }) })
    return () => controller.abort()
  }, [selectedId, revision])
  async function mutate(work) {
    if (running.current) return false
    running.current = true; setBusy(true); setActionError('')
    try { await work(); setRevision(n => n+1); window.dispatchEvent(new Event('smartclass:notifications-changed')); return true }
    catch (e) { setActionError(message(e)); return false }
    finally { running.current = false; setBusy(false) }
  }
  async function showReport(id) {
    if (running.current) return
    running.current = true; setBusy(true); setActionError('')
    try { const { data } = await api.get(`/api/classroom/bookings/${id}/report`); if (!data?.success || !data.data?.environment) throw new Error('Invalid report'); setReport(data.data) }
    catch (e) { setActionError(message(e)) }
    finally { running.current = false; setBusy(false) }
  }
  function choose(row) { setSearchParams(previous => { previous.set('bookingId', String(row.id)); return previous }) }
  function apply(event) {
    event.preventDefault()
    if (draft.from && draft.to && draft.from > draft.to) { setFilterError('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.'); return }
    setFilterError(''); setPage(0); setFilters({ ...draft })
  }
  const data = resource.data, booking = detail.data
  return <div className="personal-page teaching-page">
    <header className="personal-heading"><div><p className="eyebrow">Lịch sử sử dụng phòng của bạn</p><h1>Lịch của tôi</h1><p>Theo dõi lịch đã đăng ký, ca sắp tới và báo cáo các buổi học trước.</p></div><button className="secondary-button" onClick={() => setRevision(n => n+1)} disabled={resource.loading}><RefreshCw size={16} />Làm mới lịch</button></header>
    <form className="teaching-filters" onSubmit={apply} aria-label="Lọc lịch cá nhân">
      <label>Khoảng lịch<select aria-label="Khoảng lịch" value={draft.period} onChange={e => setDraft(v => ({ ...v, period: e.target.value }))}><option value="ALL">Tất cả lịch</option><option value="UPCOMING">Đang diễn ra & sắp tới</option><option value="PAST">Đã kết thúc</option></select></label>
      <label>Trạng thái<select aria-label="Trạng thái" value={draft.status} onChange={e => setDraft(v => ({ ...v, status: e.target.value }))}><option value="">Tất cả trạng thái</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Phòng học<select aria-label="Phòng học" value={draft.roomId} onChange={e => setDraft(v => ({ ...v, roomId: e.target.value }))}><option value="">Tất cả phòng</option>{rooms.map(room => <option key={room.id} value={room.id}>Tầng {room.floor_number} · Phòng {room.id}</option>)}</select></label>
      <label>Từ ngày<input type="date" value={draft.from} onChange={e => setDraft(v => ({ ...v, from: e.target.value }))} /></label>
      <label>Đến ngày<input type="date" value={draft.to} onChange={e => setDraft(v => ({ ...v, to: e.target.value }))} /></label>
      <div className="teaching-filter-actions"><button className="primary-button" disabled={resource.loading}><Search size={15} />Áp dụng bộ lọc</button><button className="secondary-button" type="button" onClick={() => { setDraft(defaults); setFilters(defaults); setPage(0); setFilterError('') }}>Đặt lại</button></div>
    </form>
    {filterError && <p className="personal-error" role="alert">{filterError}</p>}
    {resource.error && <p className="personal-error" role="alert">{resource.error}</p>}
    {detail.loading && <p role="status">Đang tải chi tiết lịch…</p>}
    {detail.error && <p className="personal-error" role="alert">{detail.error}</p>}
    {booking && <section className="teaching-detail" aria-label="Chi tiết lịch đã chọn"><header><div><p className="eyebrow">Phòng {booking.room_id} · Lịch #{booking.id}</p><h2>{booking.title}</h2></div><span className={`classroom-badge badge-${booking.status.toLowerCase()}`}>{labels[booking.status] || booking.status}</span></header><dl><div><dt>Bắt đầu</dt><dd>{formatTime(booking.starts_at, true)}</dd></div><div><dt>Kết thúc</dt><dd>{formatTime(booking.ends_at, true)}</dd></div><div><dt>Sĩ số dự kiến</dt><dd>{booking.expected_attendees} người</dd></div>{booking.status === 'PENDING' && <div><dt>Hạn duyệt</dt><dd>{formatTime(booking.expires_at || booking.starts_at, true)}</dd></div>}</dl>{booking.decision_note && <p className="teaching-decision">{booking.decision_note}</p>}{booking.room_status !== 'ACTIVE' && <p className="teaching-decision">Phòng đang bảo trì hoặc tạm ngưng, không nhận đăng ký/điều khiển mới.</p>}
      <div className="teaching-detail-actions"><Link to={`/classroom?roomId=${booking.room_id}`}>Mở lịch phòng</Link><button className="secondary-button" disabled={busy} onClick={() => showReport(booking.id)}>Xem báo cáo buổi học</button>{booking.status === 'PENDING' && timestampMillis(booking.expires_at || booking.starts_at) > Date.now() && booking.room_status === 'ACTIVE' && <button className="secondary-button" disabled={busy} onClick={() => { setActionError(''); setEditing(booking) }}>Sửa đăng ký</button>}{['PENDING','APPROVED'].includes(booking.status) && timestampMillis(booking.ends_at) > Date.now() && <button className="secondary-button" disabled={busy} onClick={() => { setActionError(''); setCancelling(booking) }}>Hủy lịch</button>}{booking.status === 'APPROVED' && booking.room_status === 'ACTIVE' && timestampMillis(booking.starts_at) <= Date.now() && timestampMillis(booking.ends_at) > Date.now() && <Link to={`/iot/rooms/${booking.room_id}`}>Mở thiết bị trong ca</Link>}</div>
    </section>}
    {actionError && !editing && !cancelling && <p className="personal-error" role="alert">{actionError}</p>}
    <div className="teaching-results-heading"><h2>Lịch sử đăng ký</h2><span>{data ? `${data.totalElements} lịch` : 'Đang tải…'}</span></div>
    {resource.loading && <p role="status">Đang tải lịch của bạn…</p>}
    {data && !data.rows.length && <div className="personal-empty"><CalendarDays size={32} /><h2>Chưa có lịch phù hợp</h2><p>Thay đổi bộ lọc hoặc chọn phòng để đăng ký buổi học mới.</p><Link to="/building">Tìm phòng học</Link></div>}
    <div className="teaching-list">{data?.rows.map(row => <article className={`teaching-card${String(row.id) === selectedId ? ' is-selected' : ''}`} key={row.id}><div className="teaching-card-top"><span>Phòng {row.room_id} · Tầng {row.floor_number}</span><span className={`classroom-badge badge-${row.status.toLowerCase()}`}>{labels[row.status] || row.status}</span></div><h3>{row.title}</h3><p>{formatTime(row.starts_at, true)} – {formatTime(row.ends_at, true)}</p>{row.decision_note && <p className="teaching-decision">{row.decision_note}</p>}<button className="text-button" onClick={() => choose(row)}>Xem chi tiết lịch #{row.id}</button></article>)}</div>
    {data && data.totalPages > 1 && <nav className="personal-pagination" aria-label="Phân trang lịch cá nhân"><button className="secondary-button" disabled={!page || resource.loading} onClick={() => setPage(p => p-1)}>Trước</button><span>Trang {page+1}/{data.totalPages}</span><button className="secondary-button" disabled={page+1 >= data.totalPages || resource.loading} onClick={() => setPage(p => p+1)}>Sau</button></nav>}
    <p className="personal-footnote">Chỉ hiển thị lịch thuộc tài khoản của bạn, kể cả lịch đã hủy, từ chối hoặc hết hạn. Mốc ngày theo giờ Việt Nam. <Link to="/history?tab=commands">Tra cứu lịch sử lệnh của bạn</Link></p>
    {editing && <BookingEditModal booking={editing} busy={busy} error={actionError} onClose={() => setEditing(null)} onSave={body => mutate(() => api.put(`/api/classroom/bookings/${editing.id}`, body))} />}
    {cancelling && <Modal title="Xác nhận hủy lịch" subtitle={cancelling.title} busy={busy} onClose={() => setCancelling(null)}><form className="classroom-dialog" onSubmit={async e => { e.preventDefault(); const note=String(new FormData(e.currentTarget).get('note') || ''); if (await mutate(() => api.patch(`/api/classroom/bookings/${cancelling.id}`, { status: 'CANCELLED', note }))) setCancelling(null) }}><label className="classroom-field"><span>Lý do hủy</span><textarea name="note" maxLength={500} rows={3} data-autofocus /></label>{actionError && <p role="alert">{actionError}</p>}<button className="primary-button" disabled={busy}>Xác nhận hủy</button></form></Modal>}
    {report && <Modal title="Báo cáo buổi học" subtitle={report.booking.title} onClose={() => setReport(null)}><div className="classroom-dialog"><p>Phòng {report.booking.room_id} · {formatTime(report.booking.starts_at, true)}</p><div className="classroom-metrics">{[['Mẫu đo',report.environment.samples],['Nhiệt độ TB',report.environment.average_temp,'°C'],['Độ ẩm TB',report.environment.average_humid,'%'],['Ánh sáng TB',report.environment.average_lux,'lux']].map(([label,value,unit]) => <article key={label}><span>{label}</span><strong>{value == null ? 'Chưa có dữ liệu' : `${Number(value).toLocaleString('vi-VN',{maximumFractionDigits:1})} ${unit || ''}`}</strong></article>)}</div><p>{report.note}</p><Link to={`/classroom?roomId=${report.booking.room_id}`}>Mở trang phòng để xem thêm báo cáo</Link></div></Modal>}
  </div>
}
