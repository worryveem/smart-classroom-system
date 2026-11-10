import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CalendarDays, DoorOpen, Users, Wifi, WifiOff, Wrench, RefreshCw, Plus, Thermometer, Droplets, Sun, Clock3, ArrowUpRight, Search, ClipboardList } from 'lucide-react'
import { api } from '../../services/api/client.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { usePollingResource } from '../dashboard/hooks/usePollingResource.js'
import { formatTime } from '../../utils/dateTime.js'
import Modal from '../../components/common/Modal.jsx'
import './building.css'

const statusLabels = { AVAILABLE: 'Trống theo lịch', IN_USE: 'Đang có tiết', MAINTENANCE: 'Đang bảo trì', INACTIVE: 'Tạm ngưng' }
const sensorLabels = { ONLINE: 'Dữ liệu gần nhất còn mới', STALE: 'Dữ liệu cũ', NO_DATA: 'Chưa có dữ liệu', NOT_CONNECTED: 'Chưa kết nối IoT' }
function errorText(error) { return error.response?.data?.message || 'Chưa kết nối được Backend. Vui lòng thử lại.' }
function metric(value, unit) { return value == null ? '—' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}${unit}` }
function Field({ label, ...props }) { return <label className="building-field"><span>{label}</span><input {...props} /></label> }

export default function BuildingPage() {
  const { user } = useAuth(), admin = user.role === 'ADMIN'
  const [window, setWindow] = useState(null), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [floor, setFloor] = useState(''), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [capacity, setCapacity] = useState(''), [onlyAvailable, setOnlyAvailable] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [editor, setEditor] = useState(null), [roomState, setRoomState] = useState('ACTIVE'), [events, setEvents] = useState(null)
  const [impact, setImpact] = useState(null), [impactError, setImpactError] = useState(''), [cancelAffected, setCancelAffected] = useState(false)
  useEffect(() => {
    const controller = new AbortController(); setImpact(null); setImpactError(''); setCancelAffected(false)
    if (editor?.id && roomState !== 'ACTIVE') api.get(`/api/building/rooms/${editor.id}/impact`, { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted && Array.isArray(data.data)) setImpact(data.data); else if (!controller.signal.aborted) setImpactError('Không đọc được lịch bị ảnh hưởng.') }).catch(e => { if (!controller.signal.aborted) setImpactError(errorText(e)) })
    return () => controller.abort()
  }, [editor?.id, roomState])
  const operation = useRef(false), mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const fetcher = useCallback(async signal => {
    const { data } = await api.get('/api/building/overview', { signal, params: window || {} })
    if (data.success !== true || !Array.isArray(data.data?.rooms)) throw new Error('Invalid building response')
    return data.data
  }, [window])
  const resource = usePollingResource(fetcher, 15000), data = resource.data
  const rooms = (data?.rooms || []).filter(room => (!floor || room.floor_number === Number(floor)) && (!search || `${room.id} ${room.name} ${room.equipment}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))) && (!status || room.usage_status === status) && (!capacity || room.capacity >= Number(capacity)) && (!onlyAvailable || room.available_in_window))
  const floors = [...new Set((data?.rooms || []).map(room => room.floor_number))].sort((a, b) => a - b)
  async function act(work, message) {
    if (operation.current) return
    operation.current = true; setBusy(true); setError(''); setNotice('')
    try { await work(); if (mounted.current) { setNotice(message); resource.refresh() } }
    catch (e) { if (mounted.current) setError(errorText(e)) }
    finally { operation.current = false; if (mounted.current) setBusy(false) }
  }
  function openEditor(room = {}) { setEditor(room); setRoomState(room.status || 'ACTIVE'); setError('') }
  async function saveRoom(event) {
    event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget))
    for (const key of ['roomId', 'floor', 'capacity']) input[key] = Number(input[key])
    if (editor.id && input.status !== 'ACTIVE' && (impact === null || (impact.length > 0 && !cancelAffected))) { setError('Cần kiểm tra và xác nhận xử lý các lịch bị ảnh hưởng.'); return }
    await act(async () => {
      await api[editor.id ? 'put' : 'post'](editor.id ? `/api/building/rooms/${editor.id}` : '/api/building/rooms', input, { params: { cancelAffectedBookings: cancelAffected } })
      if (mounted.current) setEditor(null)
    }, cancelAffected ? 'Đã lưu phòng và hủy các lịch bị ảnh hưởng với lý do bảo trì.' : 'Đã lưu phòng. Lịch sử sử dụng được giữ lại.')
  }
  function applyWindow(event) {
    event.preventDefault()
    if (to <= from) { setError('Giờ kết thúc phải sau giờ bắt đầu.'); return }
    if ((Date.parse(to) - Date.parse(from)) > 31 * 86400000) { setError('Chọn khoảng thời gian tối đa 31 ngày.'); return }
    setError(''); setWindow({ from: `${from}:00`, to: `${to}:00` }); setOnlyAvailable(true)
  }
  const summaries = [
    ['Tổng số phòng', data?.summary.total, Building2, 'total'], ['Đang có tiết', data?.summary.inUse, CalendarDays, 'busy'],
    ['Trống theo lịch', data?.summary.available, DoorOpen, 'free'], ['Bảo trì / tạm ngưng', data?.summary.unavailable, Wrench, 'maintenance'],
  ]
  return <div className="building-page">
    <header className="building-heading"><div><p className="eyebrow">Quản lý khu giảng đường</p><h1>Nhà A <span>Không gian học tập</span></h1><p>Theo dõi từng phòng, tìm lịch phù hợp và quản lý vận hành trong một nơi.</p></div><div className="building-heading-actions"><button onClick={resource.refresh} disabled={resource.refreshing}><RefreshCw size={16} className={resource.refreshing ? 'spin' : ''} />Làm mới</button>{admin && <button className="building-primary" onClick={() => openEditor()} disabled={busy}><Plus size={17} />Thêm phòng</button>}</div></header>
    <div className="building-summary">{summaries.map(([label, value, Icon, tone]) => <article key={label} className={`building-stat stat-${tone}`}><span className="building-stat-icon"><Icon size={22} /></span><div><span>{label}</span><strong>{value ?? '—'}</strong></div></article>)}</div>
    <div className="building-context"><span><Clock3 size={15} />{data ? `Trạng thái hiện tại: ${formatTime(data.asOf, true)}` : 'Đang tải Nhà A…'}</span><span><Wifi size={15} />Chỉ phòng 101 có ESP thật</span><span><ClipboardList size={15} />{data?.summary.pending ?? '—'} lịch chờ duyệt</span></div>
    {(error || resource.error) && <div className="building-message is-error" role="alert">{error || errorText(resource.error)}{data && ' Dữ liệu bên dưới là lần tải trước.'}</div>}
    {notice && <div className="building-message" role="status">{notice}</div>}
    <section className="building-search-panel" aria-label="Tìm phòng phù hợp"><div className="building-section-heading"><div><h2><Search size={19} />Tìm phòng trống</h2><p>Lịch đã duyệt và lịch chờ duyệt đều giữ chỗ. Phòng bảo trì không nhận đăng ký mới.</p></div></div>
      <form className="building-window" onSubmit={applyWindow}><Field label="Từ (UTC+07)" type="datetime-local" required value={from} onChange={e => setFrom(e.target.value)} /><Field label="Đến (UTC+07)" type="datetime-local" required value={to} onChange={e => setTo(e.target.value)} /><button className="building-primary" disabled={resource.refreshing}>Tìm phòng trống</button><button type="button" onClick={() => { setWindow(null); setOnlyAvailable(false); setFrom(''); setTo('') }}>Xem hiện tại</button></form>
      <div className="building-filters"><label className="building-field"><span>Tầng</span><select aria-label="Tầng" value={floor} onChange={e => setFloor(e.target.value)}><option value="">Tất cả tầng</option>{floors.map(f => <option key={f} value={f}>Tầng {f}</option>)}</select></label><label className="building-field"><span>Trạng thái hiện tại</span><select aria-label="Trạng thái hiện tại" value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Field label="Sức chứa tối thiểu" type="number" min={1} max={1000} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Số người" /><Field label="Tìm phòng / trang thiết bị" value={search} onChange={e => setSearch(e.target.value)} placeholder="101, máy chiếu…" /></div>
      <div className="building-window-note"><label><input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} /> Chỉ phòng trống trong khoảng tìm</label><span>{data ? `${formatTime(data.from, true)} → ${formatTime(data.to, true)}` : 'Mặc định: từ hiện tại đến 1 giờ sau'}</span></div>
    </section>
    <div className="building-results-heading"><h2>Sơ đồ phòng theo tầng <span>{rooms.length} phòng</span></h2><p>Trống / đang có tiết được xác định từ lịch đã duyệt, không suy ra từ cảm biến có người.</p></div>
    {resource.loading && <p role="status">Đang tải danh sách phòng…</p>}
    {!resource.loading && !rooms.length && <div className="building-empty">Không có phòng phù hợp với bộ lọc. Thử đổi giờ, sức chứa hoặc trạng thái.</div>}
    {floors.filter(f => rooms.some(room => room.floor_number === f)).map(f => <section className="building-floor" key={f}><header><span>Tầng {f}</span><div /><small>{rooms.filter(room => room.floor_number === f).length} phòng</small></header><div className="building-room-grid">{rooms.filter(room => room.floor_number === f).map(room => <article key={room.id} className={`building-room room-${room.usage_status.toLowerCase()}`} aria-label={`Phòng ${room.id}`}>
      <div className="building-room-top"><div className="building-room-number"><span>A</span><strong>{room.id}</strong></div><span className={`building-status status-${room.usage_status.toLowerCase()}`}>{statusLabels[room.usage_status]}</span></div>
      <div className="building-room-title"><h3>{room.name}</h3><span><Users size={14} />{room.capacity} chỗ</span></div>
      <p className="building-equipment">{room.equipment || 'Chưa khai báo trang thiết bị'}</p>
      {room.maintenance_note && room.status !== 'ACTIVE' && <div className="building-room-warning"><Wrench size={15} />{room.maintenance_note}</div>}
      <div className="building-room-schedule">{room.current_booking ? <><strong>{room.current_booking.title}</strong><span>{room.current_booking.owner_name} · đến {formatTime(room.current_booking.ends_at)}</span></> : <><strong>Chưa có tiết đang diễn ra</strong><span>Theo lịch đã được duyệt</span></>}{room.next_booking && <p><Clock3 size={13} />Tiếp theo: {formatTime(room.next_booking.starts_at, true)} · {room.next_booking.title}</p>}</div>
      {room.id === 101 ? <div className={`building-sensor ${room.sensor_status !== 'ONLINE' ? 'sensor-stale' : ''}`}><div className="building-sensor-heading"><span><Wifi size={14} />ESP thực tế · {sensorLabels[room.sensor_status]}</span></div><div className="building-sensor-values"><span><Thermometer size={15} /><strong>{metric(room.telemetry?.temp, '°C')}</strong></span><span><Droplets size={15} /><strong>{metric(room.telemetry?.humid, '%')}</strong></span><span><Sun size={15} /><strong>{metric(room.telemetry?.lux, ' lux')}</strong></span></div><small>{room.telemetry ? `Mẫu đo: ${formatTime(room.telemetry.timestamp, true)}` : 'Chưa nhận mẫu đo cảm biến'}{room.sensor_status === 'STALE' ? ' · Không phải trạng thái hiện tại' : ''}</small>{room.telemetry?.occupancy != null && <small>PIR: {room.telemetry.occupancy ? 'Phát hiện có người / chuyển động' : 'Không phát hiện người / chuyển động'}</small>}{room.occupancy_without_booking && <p className="building-occupancy-note">Có tín hiệu người khi chưa có tiết theo lịch; cần kiểm tra thực tế.</p>}</div> : <div className="building-no-sensor"><WifiOff size={18} /><div><strong>Chưa kết nối IoT</strong><span>Không có chỉ số cảm biến hoặc điều khiển</span></div></div>}
      <div className="building-room-counters"><span>{room.pending_bookings} lịch chờ</span><span>{room.open_incidents} sự cố mở</span>{room.id === 101 && <span>{room.active_alerts} cảnh báo</span>}</div>
      <div className="building-utilization"><span>Tỷ lệ đặt lịch trong khoảng tìm <strong>{room.booking_rate}%</strong></span><div><i style={{ width: `${room.booking_rate}%` }} /></div><small>{metric(room.booked_minutes, ' phút')} đã duyệt · Không phải tỷ lệ có người thực tế</small></div>
      <div className="building-room-actions"><Link className="action-button" to={`/classroom?roomId=${room.id}`}>Lịch & vận hành <ArrowUpRight size={15} /></Link><Link className="action-button" to={`/iot/rooms/${room.id}`}>IoT của phòng</Link>{admin && <button disabled={busy} onClick={() => openEditor(room)}>Quản lý</button>}</div>
      {window && <p className={`building-availability ${room.available_in_window ? 'is-free' : ''}`}>{room.available_in_window ? 'Có thể đăng ký trong khoảng đã chọn' : 'Không khả dụng trong khoảng đã chọn'}</p>}
    </article>)}</div></section>)}
    <footer className="building-footnote">Tự cập nhật sau mỗi 15 giây khi trang đang hiển thị. Phòng chưa có IoT không dùng dữ liệu phòng 101 thay thế. Sức chứa và trang thiết bị do quản trị viên khai báo.</footer>
    {editor && <Modal title={editor.id ? `Quản lý phòng ${editor.id}` : 'Thêm phòng Nhà A'} subtitle="Lịch sử được giữ lại; dùng tạm ngưng thay vì xóa phòng." busy={busy} onClose={() => setEditor(null)}><form className="building-dialog" onSubmit={saveRoom}><div className="building-dialog-grid"><Field label="Số phòng" name="roomId" type="number" min={100} max={9999} required readOnly={Boolean(editor.id)} defaultValue={editor.id || ''} /><Field label="Tên phòng" name="name" required maxLength={100} defaultValue={editor.name || ''} /><Field label="Tầng" name="floor" type="number" min={1} max={20} required defaultValue={editor.floor_number || 1} /><Field label="Sức chứa" name="capacity" type="number" min={1} max={1000} required defaultValue={editor.capacity || 40} /></div><Field label="Trang thiết bị (máy chiếu, bảng… do người quản lý khai báo)" name="equipment" maxLength={500} defaultValue={editor.equipment || ''} /><label className="building-field"><span>Trạng thái vận hành</span><select name="status" value={roomState} onChange={e => setRoomState(e.target.value)}><option value="ACTIVE">Đang hoạt động</option><option value="MAINTENANCE">Đang bảo trì</option><option value="INACTIVE">Tạm ngưng</option></select></label><label className="building-field"><span>Lý do bảo trì / ghi chú</span><textarea name="note" rows={3} maxLength={500} required={roomState !== 'ACTIVE'} defaultValue={editor.maintenance_note || ''} /></label>{editor.id && roomState !== 'ACTIVE' && <section className="maintenance-impact" aria-label="Lịch bị ảnh hưởng"><h3>Lịch bị ảnh hưởng</h3>{impactError ? <p role="alert">{impactError}</p> : impact === null ? <p role="status">Đang kiểm tra lịch…</p> : impact.length ? <><ul>{impact.map(row => <li key={row.id}><strong>{row.title}</strong> · {row.owner_name}<br />{formatTime(row.starts_at, true)} – {formatTime(row.ends_at)}</li>)}</ul><label><input type="checkbox" checked={cancelAffected} onChange={e => setCancelAffected(e.target.checked)} /> Tôi xác nhận hủy {impact.length} lịch trên với lý do bảo trì/tạm ngưng. Giáo viên sẽ thấy trạng thái và lý do trong Lịch của tôi.</label></> : <p>Không có lịch chưa kết thúc bị ảnh hưởng.</p>}</section>}<p className="building-footnote">Bảo trì/tạm ngưng sẽ chặn đăng ký mới, duyệt lịch và điều khiển. Các lịch cũ vẫn được giữ; quản trị viên cần xử lý hoặc thông báo lại. Chỉ phòng 101 hỗ trợ IoT.</p>{error && <p className="building-message is-error" role="alert">{error}</p>}<div className="building-dialog-actions"><button className="building-primary" disabled={busy}>Lưu phòng</button>{editor.id && <button type="button" disabled={busy} onClick={() => act(async () => { const { data } = await api.get(`/api/building/rooms/${editor.id}/events`); setEvents({ id: editor.id, rows: data.data }) }, 'Đã tải nhật ký phòng.')}>Nhật ký thay đổi</button>}</div></form></Modal>}
    {events && <Modal title={`Nhật ký phòng ${events.id}`} onClose={() => setEvents(null)}><div className="building-dialog">{events.rows.length ? events.rows.map(event => <article className="building-event" key={event.id}><strong>{event.actor} · {formatTime(event.created_at, true)}</strong><p>{event.message}</p></article>) : <p>Chưa có thay đổi được ghi nhận sau khi khởi tạo danh mục.</p>}</div></Modal>}
  </div>
}
