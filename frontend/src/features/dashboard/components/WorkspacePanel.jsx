import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, Clock3, RefreshCw } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { api } from '../../../services/api/client.js'
import { formatTime, timestampMillis } from '../../../utils/dateTime.js'
import { usePollingResource } from '../hooks/usePollingResource.js'
import Modal from '../../../components/common/Modal.jsx'

const labels = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', CANCELLED: 'Đã hủy', REJECTED: 'Từ chối', EXPIRED: 'Hết hạn' }
export default function WorkspacePanel() {
  const { user } = useAuth(), admin = user.role === 'ADMIN', student = user.role === 'STUDENT'
  const fetcher = useCallback(async signal => {
    const { data } = await api.get('/api/classroom/workspace', { signal })
    if (!data?.success || !Array.isArray(data.data?.bookings) || !Array.isArray(data.data?.incidents)) throw new Error('Invalid workspace')
    return data.data
  }, [])
  const resource = usePollingResource(fetcher, 15000)
  const [decision, setDecision] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const running = useRef(false)
  async function decide(event) {
    event.preventDefault(); if (running.current) return
    const note = String(new FormData(event.currentTarget).get('note') || '')
    running.current = true; setBusy(true); setError('')
    try { await api.patch(`/api/classroom/bookings/${decision.row.id}`, { status: decision.status, note }); setDecision(null); resource.refresh() }
    catch (e) { setError(e.response?.data?.message || 'Chưa lưu được quyết định. Vui lòng thử lại.') }
    finally { running.current = false; setBusy(false) }
  }
  const bookings = resource.data?.bookings || [], incidents = resource.data?.incidents || []
  return <section className="workspace-panel" aria-label="Không gian công việc">
    <header><div><p className="eyebrow">{admin ? 'Cần xử lý' : student ? 'Theo dõi của bạn' : 'Lịch làm việc của bạn'}</p><h2>{admin ? 'Lịch chờ duyệt toàn dãy nhà' : student ? 'Sự cố bạn đã báo' : 'Lịch của tôi'}</h2></div><button className="secondary-button" onClick={resource.refresh} disabled={resource.refreshing}><RefreshCw size={15} />Làm mới công việc</button></header>
    {resource.error && <p className="form-alert error" role="alert">Chưa tải được công việc cá nhân.{resource.data ? ' Đang hiển thị dữ liệu cũ.' : ' Bạn vẫn có thể tra cứu phòng bên dưới.'}</p>}
    {resource.loading && <p role="status">Đang tải công việc…</p>}
    {!student && resource.data && !bookings.length && <p className="workspace-empty">{admin ? 'Không có lịch đang chờ duyệt.' : 'Bạn chưa có lịch sắp tới. Chọn phòng bên dưới để đăng ký sử dụng.'}</p>}
    {!student && <div className="workspace-list">{bookings.map(row => {
      const current = row.status === 'APPROVED' && timestampMillis(row.starts_at) <= Date.now() && timestampMillis(row.ends_at) > Date.now()
      return <article key={row.id} className={current ? 'workspace-item is-current' : 'workspace-item'}><div className="workspace-item-heading"><span>Phòng {row.room_id}</span><span className={`classroom-badge badge-${row.status.toLowerCase()}`}>{current ? 'Đang trong ca' : labels[row.status]}</span></div><h3>{row.title}</h3><p><CalendarDays size={14} />{formatTime(row.starts_at, true)} – {formatTime(row.ends_at)}</p>{admin && <p>{row.owner_name}</p>}{row.expires_at && row.status === 'PENDING' && <p><Clock3 size={14} />Hạn duyệt: {formatTime(row.expires_at, true)}</p>}{row.decision_note && <p className="workspace-note">{row.decision_note}</p>}<div className="workspace-actions"><Link to={`/classroom?roomId=${row.room_id}`}>Xem lịch phòng</Link>{current && row.room_status === 'ACTIVE' && <Link to={`/iot/rooms/${row.room_id}`}>Mở thiết bị trong ca</Link>}{admin && <><button disabled={busy || Boolean(resource.error)} onClick={() => { setError(''); setDecision({ row, status: 'APPROVED' }) }}><Check size={14} />Duyệt</button><button disabled={busy || Boolean(resource.error)} onClick={() => { setError(''); setDecision({ row, status: 'REJECTED' }) }}>Từ chối</button></>}</div></article>
    })}</div>}
    {resource.data && <div className="workspace-incidents"><h3>{student ? 'Theo dõi tiến độ xử lý' : admin ? 'Sự cố cần xử lý' : 'Sự cố bạn đã báo'}</h3>{incidents.length ? incidents.slice(0, 8).map(row => <Link key={row.id} to={`/classroom?roomId=${row.room_id}&tab=incidents`}><span>Phòng {row.room_id} · {row.title}</span><strong>{row.status === 'OPEN' ? 'Mới báo' : 'Đang xử lý'}</strong></Link>) : <p>Không có sự cố chưa xử lý trong phạm vi của bạn.</p>}</div>}
    {resource.data && <p className="workspace-footnote">Hiển thị tối đa 100 lịch và 8 trong tối đa 100 sự cố gần nhất. {student ? 'Chọn phòng để tra cứu lịch hoặc báo sự cố mới.' : 'Lịch chờ giữ chỗ tối đa 24 giờ và không quá giờ bắt đầu. Các quyết định được kiểm tra lại khi lưu.'}</p>}
    {decision && <Modal title={decision.status === 'APPROVED' ? 'Duyệt lịch sử dụng' : 'Từ chối lịch sử dụng'} subtitle={`Phòng ${decision.row.room_id} · ${decision.row.title}`} busy={busy} onClose={() => setDecision(null)}><form className="classroom-dialog" onSubmit={decide}><label className="classroom-field"><span>Ghi chú quyết định</span><textarea name="note" data-autofocus maxLength={500} required={decision.status === 'REJECTED'} rows={3} /></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>Xác nhận</button></form></Modal>}
  </section>
}
