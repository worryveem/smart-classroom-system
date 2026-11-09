import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../services/api/client.js'
import { formatTime } from '../../utils/dateTime.js'
import Modal from '../../components/common/Modal.jsx'
import '../classroom/classroom.css'
import './incidents.css'

const labels = { OPEN: 'Mới báo', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã xử lý' }
const message = e => e.response?.data?.message || 'Chưa kết nối được hệ thống. Vui lòng thử lại.'
export default function IncidentsPage() {
  const { user } = useAuth(), admin = user.role === 'ADMIN'
  const [rooms, setRooms] = useState([]), [roomError, setRoomError] = useState('')
  const [roomId, setRoomId] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [resource, setResource] = useState({ loading: true, data: null, error: '' })
  const [creating, setCreating] = useState(false), [detail, setDetail] = useState(null), [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('')
  const running = useRef(false), mounted = useRef(false), detailRequest = useRef(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; detailRequest.current?.abort() } }, [])
  useEffect(() => {
    const controller = new AbortController(); setRoomError('')
    api.get('/api/building/rooms', { signal: controller.signal }).then(({ data }) => {
      if (!data.success || !Array.isArray(data.data)) throw new Error('Danh sách phòng không hợp lệ')
      if (!controller.signal.aborted) setRooms(data.data)
    }).catch(e => { if (!controller.signal.aborted) setRoomError(message(e)) })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    const controller = new AbortController(); setResource({ loading: true, data: null, error: '' })
    api.get('/api/incidents', { signal: controller.signal, params: { page, size: 10, ...(roomId ? { roomId } : {}), ...(status ? { status } : {}) } }).then(({ data }) => {
      if (!data.success || !Array.isArray(data.data?.rows)) throw new Error('Danh sách sự cố không hợp lệ')
      if (!controller.signal.aborted) {
        setResource({ loading: false, data: data.data, error: '' })
        if (page > 0 && page >= data.data.totalPages) setPage(Math.max(0, data.data.totalPages - 1))
      }
    }).catch(e => { if (!controller.signal.aborted) setResource({ loading: false, data: null, error: message(e) }) })
    return () => controller.abort()
  }, [roomId, status, page, revision])
  async function open(row) {
    detailRequest.current?.abort()
    const controller = new AbortController(); detailRequest.current = controller
    setDetail({ loading: true, row, events: [], error: '' }); setActionError('')
    try {
      const [record, history] = await Promise.all([
        api.get(`/api/classroom/incidents/${row.id}`, { signal: controller.signal }),
        api.get(`/api/classroom/incidents/${row.id}/events`, { signal: controller.signal }),
      ])
      if (!record.data.success || !record.data.data?.id || !history.data.success || !Array.isArray(history.data.data)) throw new Error('Phản hồi không hợp lệ')
      if (mounted.current && !controller.signal.aborted) setDetail({ loading: false, row: record.data.data, events: history.data.data, error: '' })
    } catch (e) { if (mounted.current && !controller.signal.aborted) setDetail({ loading: false, row, events: [], error: message(e) }) }
  }
  async function submit(event, update = false) {
    event.preventDefault(); if (running.current) return
    const form = new FormData(event.currentTarget)
    const body = update ? { status: form.get('status'), note: form.get('note').trim() }
      : { roomId: Number(form.get('roomId')), title: form.get('title').trim(), description: form.get('description').trim() }
    if (update ? !body.note : !body.title || !body.description) { setActionError('Vui lòng nhập đầy đủ nội dung, không chỉ khoảng trắng.'); return }
    running.current = true; setBusy(true); setActionError(''); setNotice('')
    try {
      const response = update ? await api.patch(`/api/classroom/incidents/${editing.id}`, body) : await api.post('/api/classroom/incidents', body)
      if (!response.data.success) throw new Error('Phản hồi không hợp lệ')
      if (mounted.current) {
        setCreating(false); setEditing(null); setRevision(v => v + 1); setPage(0)
        setNotice(update ? 'Đã cập nhật xử lý sự cố.' : 'Đã gửi báo cáo sự cố. Quản trị viên sẽ tiếp nhận xử lý.')
      }
    } catch (e) { if (mounted.current) setActionError(message(e)) }
    finally { running.current = false; if (mounted.current) setBusy(false) }
  }
  const data = resource.data
  return <div className="incidents-page">
    <header className="incidents-heading"><div><h1>Báo cáo sự cố</h1><p>{admin ? 'Tất cả sự cố trong các phòng học. Tiếp nhận, theo dõi và cập nhật xử lý.' : 'Gửi báo cáo và theo dõi tiến độ xử lý các sự cố bạn đã báo.'}</p></div><button className="primary-button" disabled={!rooms.length || busy} onClick={() => { setActionError(''); setCreating(true) }}><Plus size={17} />Báo sự cố mới</button></header>
    {notice && <p className="incidents-notice" role="status">{notice}</p>}
    {roomError && <p className="incidents-error" role="alert">Chưa tải được phòng: {roomError} <button className="text-button" onClick={() => setRevision(v => v + 1)}>Thử lại</button></p>}
    <div className="incidents-filters"><label><span id="incident-room-filter-label">Phòng học</span><select aria-labelledby="incident-room-filter-label" value={roomId} onChange={e => { setRoomId(e.target.value); setPage(0) }}><option value="">Tất cả phòng</option>{rooms.map(room => <option key={room.id} value={room.id}>Phòng {room.id} · {room.name}</option>)}</select></label><label><span id="incident-status-filter-label">Trạng thái</span><select aria-labelledby="incident-status-filter-label" value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="">Tất cả trạng thái</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="secondary-button" disabled={resource.loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} />Làm mới</button></div>
    {resource.loading ? <p role="status">Đang tải sự cố…</p> : resource.error ? <div className="incidents-error" role="alert">{resource.error} <button className="text-button" onClick={() => setRevision(v => v + 1)}>Thử tải lại</button></div> : <>
      <div className="incidents-count">{admin ? 'Tất cả sự cố' : 'Sự cố của tôi'} <strong>{data?.totalElements ?? 0}</strong></div>
      {!data?.rows.length ? <div className="incidents-empty"><AlertTriangle size={32} /><h2>Chưa có sự cố phù hợp</h2><p>Thay đổi bộ lọc hoặc gửi báo cáo mới khi phòng học cần hỗ trợ.</p></div> : <div className="incidents-list">{data.rows.map(row => <article className="incident-card" key={row.id}><div className="incident-card-top"><span>Phòng {row.room_id} · #{row.id}</span><span className={`classroom-badge badge-${row.status.toLowerCase()}`}>{labels[row.status]}</span></div><h2>{row.title}</h2><p className="incident-description">{row.description}</p><p className="incident-meta">{admin ? `Người báo: ${row.reporter_name} · ` : ''}{formatTime(row.created_at, true)}{row.device_id ? ` · Thiết bị: ${row.device_id}` : ''}</p>{row.resolution && <p className="incident-resolution">Cập nhật: {row.resolution}</p>}<div className="incident-actions"><button className="secondary-button" onClick={() => open(row)}>Chi tiết & lịch sử</button>{admin && <button className="primary-button" onClick={() => { setEditing(row); setActionError('') }}>Cập nhật xử lý</button>}<Link to={`/classroom?roomId=${row.room_id}&tab=incidents&incidentId=${row.id}`}>Mở phòng {row.room_id}</Link></div></article>)}</div>}
      {data?.totalPages > 1 && <nav className="incidents-pagination" aria-label="Phân trang sự cố"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(v => v - 1)}>Trước</button><span>Trang {page + 1}/{data.totalPages}</span><button className="secondary-button" disabled={page + 1 >= data.totalPages} onClick={() => setPage(v => v + 1)}>Sau</button></nav>}
    </>}
    {creating && <Modal title="Báo sự cố mới" busy={busy} onClose={() => setCreating(false)}><form className="classroom-dialog" onSubmit={submit}><label className="classroom-field"><span>Phòng xảy ra sự cố</span><select name="roomId" required defaultValue={roomId || ''} data-autofocus><option value="" disabled>Chọn phòng học</option>{rooms.map(room => <option key={room.id} value={room.id}>Phòng {room.id} · {room.name}</option>)}</select></label><label className="classroom-field"><span>Tiêu đề sự cố</span><input name="title" required maxLength={150} /></label><label className="classroom-field"><span>Mô tả sự cố</span><textarea name="description" required maxLength={2000} rows={5} /></label>{actionError && <p role="alert">{actionError}</p>}<button className="primary-button" disabled={busy}>Gửi báo cáo</button></form></Modal>}
    {editing && <Modal title="Cập nhật xử lý sự cố" subtitle={`Phòng ${editing.room_id} · ${editing.title}`} busy={busy} onClose={() => setEditing(null)}><form className="classroom-dialog" onSubmit={e => submit(e, true)}><label className="classroom-field"><span>Trạng thái xử lý</span><select name="status" required defaultValue={Object.keys(labels).find(key => key !== editing.status)} data-autofocus>{Object.entries(labels).filter(([key]) => key !== editing.status).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="classroom-field"><span>Ghi chú xử lý</span><textarea name="note" required maxLength={2000} rows={4} /></label>{actionError && <p role="alert">{actionError}</p>}<button className="primary-button" disabled={busy}>Lưu cập nhật</button></form></Modal>}
    {detail && <Modal title="Chi tiết sự cố" subtitle={`Phòng ${detail.row.room_id} · ${detail.row.title}`} onClose={() => { detailRequest.current?.abort(); setDetail(null) }}><div className="classroom-dialog">{detail.loading ? <p role="status">Đang tải lịch sử…</p> : detail.error ? <p role="alert">{detail.error} <button className="text-button" onClick={() => open(detail.row)}>Thử lại</button></p> : <><p>{detail.row.description}</p><h3>Lịch sử xử lý</h3>{detail.events.length ? detail.events.map(item => <article key={item.id}><strong>{labels[item.status]} · {item.actor}</strong><p>{item.note}</p><small>{formatTime(item.created_at, true)}</small></article>) : <p>Chưa có lịch sử xử lý.</p>}</>}</div></Modal>}
  </div>
}
