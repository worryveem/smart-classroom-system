import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { api } from '../../services/api/client.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { formatTime, timestampMillis } from '../../utils/dateTime.js'
import Modal from '../../components/common/Modal.jsx'
import { Link, useSearchParams } from 'react-router-dom'
import './classroom.css'
import BookingEditModal from './BookingEditModal.jsx'

const labels = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn duyệt', OPEN: 'Mới báo', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã xử lý', SUCCESS: 'Đã thực thi', ACCEPTED: 'Đã tiếp nhận', FAILURE: 'Thất bại', TIMEOUT: 'Hết thời gian chờ', UNCONFIRMED: 'Chưa xác nhận' }
const tabs = [['bookings', 'Lịch phòng & báo cáo'], ['alerts', 'Cảnh báo'], ['incidents', 'Sự cố & bảo trì'], ['attempts', 'Kết quả điều khiển'], ['settings', 'Cấu hình phòng']]
function errorText(error) {
  if (error.response?.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  return error.response?.data?.message || 'Không kết nối được Backend. Vui lòng thử lại.'
}
async function read(path, signal, roomId = 101) {
  const { data } = await api.get(`/api/classroom/${path}`, { signal, params: { roomId } })
  if (!data.success) throw new Error('Phản hồi không hợp lệ')
  return data.data
}
function Badge({ status }) { return <span className={`classroom-badge badge-${status?.toLowerCase()}`}>{labels[status] || status}</span> }
function Field({ label, ...props }) { return <label className="classroom-field"><span>{label}</span><input {...props} /></label> }
function Table({ headers, children }) { return <div className="classroom-scroll"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div> }

export default function ClassroomPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const roomId = Number(searchParams.get('roomId') || 101)
  const [roomInfo, setRoomInfo] = useState(null), [contextError, setContextError] = useState(''), [editingBooking, setEditingBooking] = useState(null)
  const iot = roomInfo?.iotEnabled === true
  const admin = user.role === 'ADMIN', staff = user.role !== 'STUDENT'
  const [tab, setTab] = useState('bookings'), [revision, setRevision] = useState(0)
  const [rows, setRows] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [permission, setPermission] = useState(null)
  const [report, setReport] = useState(null), [events, setEvents] = useState(null), [decision, setDecision] = useState(null), [incidentEdit, setIncidentEdit] = useState(null)
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [filter, setFilter] = useState(''), operation = useRef(false), mounted = useRef(false)
  const [focusedBooking, setFocusedBooking] = useState(null), [linkError, setLinkError] = useState('')
  useEffect(() => {
    const controller = new AbortController(); setFocusedBooking(null); setLinkError('')
    const bookingId=searchParams.get('bookingId'), incidentId=searchParams.get('incidentId')
    if (bookingId && staff) {
      if (!/^[1-9]\d{0,18}$/.test(bookingId)) { setLinkError('Mã lịch trong đường dẫn không hợp lệ.'); return () => controller.abort() }
      read(`bookings/${bookingId}`, controller.signal, roomId).then(row => { if (!controller.signal.aborted) { if (row?.room_id !== roomId) throw new Error('Wrong room'); setFocusedBooking(row) } }).catch(e => { if (!controller.signal.aborted) setLinkError(e.response?.data?.message || 'Không mở được lịch được chọn trong phòng này.') })
    }
    if (incidentId && searchParams.get('tab') === 'incidents') {
      if (!/^[1-9]\d{0,18}$/.test(incidentId)) { setLinkError('Mã sự cố trong đường dẫn không hợp lệ.'); return () => controller.abort() }
      Promise.all([read(`incidents/${incidentId}`,controller.signal,roomId),read(`incidents/${incidentId}/events`,controller.signal,roomId)]).then(([incident,history]) => { if (!controller.signal.aborted) { if (incident?.room_id !== roomId) throw new Error('Wrong room'); setEvents({ title: incident.title, rows: history, incident }) } }).catch(e => { if (!controller.signal.aborted) setLinkError(errorText(e)) })
    }
    return () => controller.abort()
  }, [searchParams, roomId, revision, staff])
  const bookingRows = Array.isArray(rows) ? focusedBooking && !rows.some(row => row.id === focusedBooking.id) ? [focusedBooking, ...rows] : rows : []
  useEffect(() => { setTab(searchParams.get('tab') === 'incidents' ? 'incidents' : 'bookings'); setReport(null); setEvents(null); setDecision(null); setIncidentEdit(null); setEditingBooking(null); setFilter(''); setNotice('') }, [roomId, searchParams])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setRows(null); setError('')
    const query = tab === 'bookings' && filter ? `bookings?${filter}` : tab
    read(query, controller.signal, roomId)
      .then(data => { if (!controller.signal.aborted) setRows(data) })
      .catch(e => { if (!axios.isCancel(e)) setError(errorText(e)) })
    return () => controller.abort()
  }, [tab, revision, filter, roomId])
  useEffect(() => {
    const controller = new AbortController(); setPermission(null); setRoomInfo(null); setContextError('')
    read('permission', controller.signal, roomId).then(access => { if (!controller.signal.aborted) setPermission(access) }).catch(() => { if (!controller.signal.aborted) setContextError('Chưa kiểm tra được quyền. Lịch và sự cố vẫn có thể tra cứu.') })
    api.get(`/api/iot/rooms/${roomId}`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setRoomInfo(data.data) }).catch(() => { if (!controller.signal.aborted) setContextError('Chưa tải được cấu hình phòng; tạm khóa đăng ký mới.') })
    return () => controller.abort()
  }, [roomId, revision])

  async function act(work, message = 'Đã lưu thay đổi.') {
    if (operation.current) return false
    operation.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await work()
      if (mounted.current) { setNotice(message); setRevision(v => v + 1) }
      return true
    } catch (e) { if (mounted.current) setError(errorText(e)); return false }
    finally { operation.current = false; if (mounted.current) setBusy(false) }
  }
  async function createBooking(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form)
    const start = String(data.get('startsAt')), end = String(data.get('endsAt'))
    if (end <= start) { setError('Giờ kết thúc phải sau giờ bắt đầu.'); return }
    if (await act(() => api.post('/api/classroom/bookings', { title: data.get('title'), startsAt: `${start}:00`, endsAt: `${end}:00`, roomId, expectedAttendees: Number(data.get('expectedAttendees')) }), 'Đã gửi lịch chờ quản trị viên duyệt.')) form.reset()
  }
  async function createIncident(event) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form)
    if (await act(() => api.post('/api/classroom/incidents', { ...Object.fromEntries(data), roomId }), 'Đã gửi báo cáo sự cố.')) form.reset()
  }
  async function showReport(id) { await act(async () => setReport(await read(`bookings/${id}/report`)), 'Đã tải báo cáo từ dữ liệu thực tế.') }
  async function showEvents(row) { await act(async () => setEvents({ title: row.title, rows: await read(`incidents/${row.id}/events`) }), 'Đã tải lịch sử xử lý.') }
  function exportReport() {
    const summary = report.environment
    const values = [['Phòng', report.booking.room_id || roomId], ['Buổi học', report.booking.title], ['Giáo viên', report.booking.owner_name], ['Bắt đầu', formatTime(report.booking.starts_at, true)], ['Kết thúc', formatTime(report.booking.ends_at, true)],
      ['Số mẫu đo', summary.samples], ['Nhiệt độ trung bình (°C)', summary.average_temp], ['Độ ẩm trung bình (%)', summary.average_humid], ['Ánh sáng trung bình (lux)', summary.average_lux], ['Số mẫu vượt ngưỡng nhiệt', summary.hot_samples], ['Số mẫu thiếu sáng khi có người', summary.dark_occupied_samples],
      ...report.commands.map(c => [`Lệnh ${labels[c.status] || c.status}`, c.total]), ['Ghi chú', report.note]]
    const cell = value => {
      const text = String(value ?? 'Chưa có dữ liệu')
      const safe = /^\s*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const blob = new Blob(['\uFEFF' + values.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `bao-cao-buoi-${report.booking.id}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="classroom-page">
    <header className="classroom-heading"><div><p className="eyebrow">Nhà A · Phòng {roomId}</p><h1>Vận hành phòng học</h1><p>Phòng {roomId} · Lịch sử dụng, môi trường và bảo trì.</p><Link to="/building" className="classroom-back">← Xem tất cả phòng Nhà A</Link></div><button disabled={busy} onClick={() => setRevision(v => v + 1)}>Làm mới</button></header>
    {roomInfo && !iot && <div className="classroom-access"><strong>Phòng chưa kết nối IoT</strong><span>Vẫn quản lý lịch học và sự cố. Không có số liệu cảm biến hoặc điều khiển; không dùng dữ liệu phòng 101 thay thế.</span></div>}
    {contextError && <p className="classroom-note" role="status">{contextError}</p>}
    {roomInfo && roomInfo.status !== 'ACTIVE' && <div className="classroom-message error" role="status">Phòng đang bảo trì hoặc tạm ngưng. Không nhận đăng ký mới. {roomInfo.maintenance_note}</div>}
    <p><Link className="classroom-back" to={`/iot/rooms/${roomId}`}>Mở trang IoT phòng {roomId} →</Link></p>
    {permission && <div className="classroom-access"><strong>{permission.allowed ? 'Được phép điều khiển' : 'Chỉ theo dõi'}</strong><span>{permission.reason}. Quyền được Backend kiểm tra tại thời điểm gửi lệnh.</span></div>}
    <nav className="classroom-tabs" aria-label="Nghiệp vụ phòng học">{tabs.filter(([id]) => (id !== 'attempts' || (staff && iot)) && (id !== 'settings' || (admin && iot))).map(([id, label]) => <button key={id} aria-current={id === tab ? 'page' : undefined} onClick={() => { setTab(id); setNotice('') }} disabled={busy}>{label}</button>)}</nav>
    {error && <div className="classroom-message error" role="alert">{error}</div>}
    {linkError && <div className="classroom-message error" role="alert">{linkError}</div>}
    {notice && <div className="classroom-message" role="status">{notice}</div>}
    {!rows && !error && <p role="status">Đang tải dữ liệu phòng học…</p>}

    {tab === 'bookings' && <>
      {staff && <section className="classroom-panel"><h2>Đăng ký sử dụng phòng</h2><form className="classroom-form" onSubmit={createBooking}>
        <Field label="Môn học / nội dung" name="title" required maxLength={150} placeholder="Ví dụ: Thực hành IoT" />
        <Field label="Sĩ số dự kiến" name="expectedAttendees" type="number" required min={1} max={1000} defaultValue={1} />
        <Field label="Bắt đầu (UTC+07)" name="startsAt" type="datetime-local" required />
        <Field label="Kết thúc (UTC+07)" name="endsAt" type="datetime-local" required />
        <button disabled={busy || !roomInfo || roomInfo.status !== 'ACTIVE'} type="submit">Gửi đăng ký</button>
      </form><p className="classroom-note">Tối đa 12 giờ mỗi lịch. Lịch chờ giữ chỗ tối đa 24 giờ hoặc đến giờ bắt đầu, tùy thời điểm nào đến trước; hai ca liền nhau được phép. ADMIN tạo lịch cũng cần xác nhận duyệt để giữ quy trình hai bước.</p></section>}
      <section className="classroom-panel"><h2>Lịch phòng học</h2><form className="classroom-form filter" onSubmit={e => { e.preventDefault(); if (to <= from) { setError('Khoảng thời gian lọc chưa hợp lệ.'); return }; setFilter(new URLSearchParams({ from: `${from}:00`, to: `${to}:00` }).toString()) }}>
        <Field label="Từ (UTC+07)" type="datetime-local" required value={from} onChange={e => setFrom(e.target.value)} /><Field label="Đến (UTC+07)" type="datetime-local" required value={to} onChange={e => setTo(e.target.value)} /><button disabled={busy}>Lọc lịch</button><button type="button" onClick={() => { setFilter(''); setFrom(''); setTo('') }}>Mặc định</button>
      </form><p className="classroom-note">Mặc định từ 7 ngày trước đến 38 ngày sau; tối đa 500 lịch trong khoảng lọc không quá 93 ngày.</p>
        {Array.isArray(rows) && <Table headers={['Buổi học', 'Giáo viên', 'Thời gian', 'Trạng thái', 'Thao tác']}>
          {bookingRows.map(row => <tr key={row.id} className={row.id === focusedBooking?.id ? 'classroom-focused' : ''}><td><strong>{row.title}</strong>{row.id === focusedBooking?.id && <small>Được mở từ thông báo</small>}<small>Phòng {row.room_id || roomId} · {row.expected_attendees || 1} người dự kiến</small>{row.decision_note && <small>{row.decision_note}</small>}</td><td>{row.owner_name}</td><td>{formatTime(row.starts_at, true)}<small>đến {formatTime(row.ends_at, true)}</small></td><td><Badge status={row.status} /></td><td><div className="classroom-actions">
            {admin && row.status === 'PENDING' && timestampMillis(row.expires_at || row.starts_at) > Date.now() && <><button disabled={busy || roomInfo?.status !== 'ACTIVE'} onClick={() => setDecision({ row, status: 'APPROVED' })}>Duyệt</button><button disabled={busy} onClick={() => setDecision({ row, status: 'REJECTED' })}>Từ chối</button></>}
            {(admin || row.owner_id === user.id) && row.status === 'PENDING' && timestampMillis(row.expires_at || row.starts_at) > Date.now() && <button disabled={busy || roomInfo?.status !== 'ACTIVE'} onClick={() => setEditingBooking(row)}>Sửa đăng ký</button>}
            {(admin || row.owner_id === user.id) && ['PENDING', 'APPROVED'].includes(row.status) && timestampMillis(row.ends_at) > Date.now() && <button disabled={busy} onClick={() => setDecision({ row, status: 'CANCELLED' })}>Hủy lịch</button>}
            {staff && (admin || row.owner_id === user.id) && <button disabled={busy} onClick={() => showReport(row.id)}>Báo cáo</button>}
          </div></td></tr>)}
        </Table>}{Array.isArray(rows) && !bookingRows.length && <p className="classroom-empty">Chưa có lịch trong khoảng thời gian này.</p>}
      </section>
    </>}

    {tab === 'alerts' && !iot && <section className="classroom-panel"><h2>Cảnh báo môi trường</h2><p>Phòng {roomId} chưa có cảm biến. Chưa hỗ trợ cảnh báo môi trường cho phòng này.</p></section>}
    {tab === 'alerts' && iot && <section className="classroom-panel"><h2>Cảnh báo môi trường</h2><p className="classroom-note">Kiểm tra mỗi 30 giây từ telemetry trong MySQL. Xác nhận cảnh báo không đồng nghĩa điều kiện đã kết thúc. Nhấn Làm mới để tải trạng thái mới nhất.</p>
      {Array.isArray(rows) && <Table headers={['Cảnh báo', 'Phát hiện', 'Trạng thái', 'Xác nhận']}>
        {rows.map(row => <tr key={row.id}><td>{row.message}</td><td>{formatTime(row.started_at, true)}</td><td>{row.ended_at ? `Kết thúc: ${formatTime(row.ended_at, true)}` : 'Đang diễn ra'}</td><td>{row.acknowledged_at ? <>{row.acknowledged_by}<small>{formatTime(row.acknowledged_at, true)}</small></> : staff ? <button disabled={busy || (!admin && !permission?.canAcknowledge)} title={!admin && !permission?.canAcknowledge ? 'Cần ca đang diễn ra tại phòng; quyền xác nhận được kiểm tra lại ở Backend.' : undefined} onClick={() => act(() => api.post(`/api/classroom/alerts/${row.id}/acknowledge`))}>Xác nhận đã xem</button> : 'Chưa xác nhận'}</td></tr>)}
      </Table>}{Array.isArray(rows) && !rows.length && <p className="classroom-empty">Chưa ghi nhận cảnh báo. Điều này không thay thế kiểm tra kết nối thiết bị.</p>}<p className="classroom-note">Hiển thị tối đa 200 cảnh báo, ưu tiên các cảnh báo đang diễn ra.</p>
    </section>}

    {tab === 'incidents' && <>
      {roomInfo && <section className="classroom-panel"><h2>Tình trạng sự cố của phòng</h2><p className="classroom-note">Thông tin tổng hợp để tránh báo trùng; không hiển thị nội dung riêng hoặc người báo.</p>{roomInfo.incidentSummary?.length ? roomInfo.incidentSummary.map((item, index) => <p key={index}>{item.device_id || 'Toàn phòng'} · {labels[item.status]} · {item.total} báo cáo</p>) : <p>Chưa có sự cố đang mở được ghi nhận.</p>}</section>}
      <section className="classroom-panel"><h2>Báo cáo sự cố</h2><form className="classroom-form" onSubmit={createIncident}><Field label="Tiêu đề" name="title" required maxLength={150} /><label className="classroom-field"><span>Thiết bị gặp sự cố</span><select name="deviceId"><option value="">Toàn phòng / không xác định thiết bị</option>{(roomInfo?.devices || []).map(device => <option key={device.device_id}>{device.device_id}</option>)}</select></label><label className="classroom-field wide"><span>Mô tả sự cố</span><textarea name="description" required maxLength={2000} rows={3} /></label><button disabled={busy}>Gửi báo cáo</button></form></section>
      <section className="classroom-panel"><h2>{admin ? 'Sự cố trong phòng' : 'Sự cố bạn đã báo'}</h2>{Array.isArray(rows) && <Table headers={['Sự cố', 'Người báo', 'Trạng thái', 'Xử lý']}>
        {rows.map(row => <tr key={row.id}><td><strong>{row.title}</strong><small>{row.device_id || 'Toàn phòng'} · {row.description}</small><small>{formatTime(row.created_at, true)}</small></td><td>{row.reporter_name}</td><td><Badge status={row.status} /><small>{row.resolution}</small></td><td><div className="classroom-actions"><button disabled={busy} onClick={() => showEvents(row)}>Lịch sử xử lý</button>{admin && <button disabled={busy} onClick={() => setIncidentEdit(row)}>Cập nhật</button>}</div></td></tr>)}
      </Table>}{Array.isArray(rows) && !rows.length && <p className="classroom-empty">Chưa có báo cáo sự cố.</p>}<p className="classroom-note">Hiển thị tối đa 200 sự cố gần nhất.</p></section>
    </>}

    {tab === 'attempts' && <section className="classroom-panel"><h2>Kết quả từng lần điều khiển</h2><p className="classroom-note">Đã tiếp nhận chưa có nghĩa là đã thực thi. “Đang chờ / chưa xác nhận” cần kiểm tra trạng thái thiết bị; không tự gửi lại. Không suy đoán kết quả từ lịch sử cũ.</p>
      {Array.isArray(rows) && <Table headers={['Thời điểm', 'Người gửi / ca học', 'Lệnh', 'Kết quả', 'Ghi chú']}>
        {rows.map(row => <tr key={row.id}><td>{formatTime(row.created_at, true)}</td><td>{row.actor_name}<small>{row.booking_id ? `Ca #${row.booking_id}` : 'Quản trị viên'}</small></td><td>{row.target} · {row.action}</td><td>{row.status === 'PENDING' ? 'Đang chờ / chưa xác nhận' : <Badge status={row.status} />}</td><td>{row.message}<small>Lưu lịch sử: {row.log_status === 'SAVED' ? 'Đã lưu' : row.log_status === 'FAILED' ? 'Lỗi lưu' : 'Chưa lưu'}</small></td></tr>)}
      </Table>}{Array.isArray(rows) && !rows.length && <p className="classroom-empty">Chưa có lần điều khiển được ghi nhận từ khi bật tính năng này.</p>}<p className="classroom-note">Hiển thị tối đa 200 lần gửi gần nhất; giáo viên chỉ xem lệnh của mình.</p>
    </section>}

    {tab === 'settings' && rows && <section className="classroom-panel"><h2>Cấu hình phòng và ngưỡng cảnh báo</h2><form key={revision} className="classroom-form" onSubmit={e => {
      e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); ['temperatureLimit', 'minimumLux', 'sustainedSeconds', 'offlineSeconds'].forEach(key => { data[key] = Number(data[key]) }); act(() => api.put('/api/classroom/settings', data))
    }}>
      <Field label="Tên phòng" name="name" required readOnly maxLength={100} defaultValue={rows.name} /><Field label="Mã cảm biến thật" name="sensorDeviceId" required maxLength={50} defaultValue={rows.sensor_device_id} />
      <Field label="Cảnh báo nhiệt độ trên (°C)" name="temperatureLimit" type="number" min={0} max={60} step="0.1" required defaultValue={rows.temperature_limit} /><Field label="Thiếu sáng dưới (lux)" name="minimumLux" type="number" min={0} max={100000} step="0.1" required defaultValue={rows.minimum_lux} />
      <Field label="Duy trì điều kiện ít nhất (giây)" name="sustainedSeconds" type="number" min={30} max={3600} required defaultValue={rows.sustained_seconds} /><Field label="Mất dữ liệu sau (giây)" name="offlineSeconds" type="number" min={60} max={86400} required defaultValue={rows.offline_seconds} />
      <button disabled={busy}>Lưu cấu hình</button></form><p className="classroom-note">Ngưỡng phục vụ quản lý phòng, không phải kết luận y tế. Cấu hình này áp dụng cho cảnh báo và báo cáo; không thay đổi cấu hình kết nối IoT của Dashboard hoặc Node-RED.</p></section>}

    {decision && <Modal title={`${labels[decision.status]} lịch sử dụng`} subtitle={decision.row.title} busy={busy} onClose={() => setDecision(null)}><form className="classroom-dialog" onSubmit={async e => { e.preventDefault(); const note = new FormData(e.currentTarget).get('note'); if (await act(() => api.patch(`/api/classroom/bookings/${decision.row.id}`, { status: decision.status, note }))) setDecision(null) }}><label className="classroom-field"><span>Ghi chú quyết định</span><textarea data-autofocus name="note" maxLength={500} rows={3} /></label><button disabled={busy}>Xác nhận</button>{error && <p role="alert">{error}</p>}</form></Modal>}
    {editingBooking && <BookingEditModal booking={{ ...editingBooking, room_id: editingBooking.room_id || roomId }} busy={busy} error={error} onClose={() => setEditingBooking(null)} onSave={body => act(() => api.put(`/api/classroom/bookings/${editingBooking.id}`, body), 'Đã cập nhật đăng ký; hạn duyệt không được gia hạn.')} />}
    {incidentEdit && <Modal title="Cập nhật xử lý sự cố" subtitle={incidentEdit.title} busy={busy} onClose={() => setIncidentEdit(null)}><form className="classroom-dialog" onSubmit={async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); if (await act(() => api.patch(`/api/classroom/incidents/${incidentEdit.id}`, data))) setIncidentEdit(null) }}><label className="classroom-field"><span>Trạng thái mới</span><select name="status" defaultValue={incidentEdit.status}>{['OPEN', 'IN_PROGRESS', 'RESOLVED'].map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label><label className="classroom-field"><span>Nội dung xử lý / lý do mở lại</span><textarea name="note" data-autofocus required maxLength={2000} rows={4} /></label><button disabled={busy}>Lưu xử lý</button>{error && <p role="alert">{error}</p>}</form></Modal>}
    {events && <Modal title="Lịch sử xử lý" subtitle={events.title} onClose={() => setEvents(null)}><div className="classroom-dialog">{events.incident && <><Badge status={events.incident.status} /><p>{events.incident.description}</p></>}{events.rows.map(row => <article className="classroom-event" key={row.id}><Badge status={row.status} /><p>{row.note}</p><small>{row.actor} · {formatTime(row.created_at, true)}</small></article>)}</div></Modal>}
    {report && <Modal title="Báo cáo buổi học" subtitle={report.booking.title} onClose={() => setReport(null)}><div className="classroom-dialog"><p>{formatTime(report.booking.starts_at, true)} – {formatTime(report.booking.ends_at, true)}</p><p>Trạng thái lịch: {labels[report.booking.status]}</p><div className="classroom-metrics">{[['Mẫu đo thật', report.environment.samples], ['Nhiệt độ TB', report.environment.average_temp, '°C'], ['Độ ẩm TB', report.environment.average_humid, '%'], ['Ánh sáng TB', report.environment.average_lux, 'lux'], ['Mẫu vượt ngưỡng nhiệt', report.environment.hot_samples], ['Mẫu thiếu sáng có người', report.environment.dark_occupied_samples]].map(([label, value, unit]) => <article key={label}><span>{label}</span><strong>{value == null ? 'Chưa có dữ liệu' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${unit || ''}`}</strong></article>)}</div><h3>Kết quả lệnh trong ca</h3>{report.commands.length ? report.commands.map(c => <p key={c.status}>{c.status === 'PENDING' ? 'Đang chờ / chưa xác nhận' : labels[c.status] || c.status}: {c.total}</p>) : <p>Chưa có lần điều khiển gắn với ca này.</p>}<h3>Cảnh báo giao với thời gian buổi học</h3>{report.alerts.length ? report.alerts.map(a => <p key={a.id}>{a.message}</p>) : <p>Chưa ghi nhận cảnh báo.</p>}<p className="classroom-note">{report.note}</p><button onClick={exportReport}>Tải báo cáo CSV</button></div></Modal>}
  </div>
}
