import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CalendarDays, DoorOpen, RefreshCw, Wrench, Wifi, AlertCircle, ArrowUpRight } from 'lucide-react'
import { api } from '../../../services/api/client.js'
import { formatTime } from '../../../utils/dateTime.js'
import { usePollingResource } from '../hooks/usePollingResource.js'
import '../../building/building.css'
import '../overview.css'
import { useAuth } from '../../../context/AuthContext.jsx'
import WorkspacePanel from '../components/WorkspacePanel.jsx'
import '../../classroom/classroom.css'

const statuses = { IN_USE: 'Đang có tiết', AVAILABLE: 'Trống theo lịch', MAINTENANCE: 'Bảo trì', INACTIVE: 'Tạm ngưng' }
const connections = { ONLINE: 'Có dữ liệu mới', STALE: 'Dữ liệu cũ', NO_DATA: 'Chưa có dữ liệu', NOT_CONNECTED: 'Chưa lắp IoT' }
export default function OverviewPage() {
  const { user } = useAuth()
  const fetcher = useCallback(async signal => {
    const { data } = await api.get('/api/building/overview', { signal })
    if (data?.success !== true || !Array.isArray(data.data?.rooms) || !data.data?.summary) throw new Error('Invalid overview response')
    return data.data
  }, [])
  const resource = usePollingResource(fetcher, 15000)
  const data = resource.data, rooms = data?.rooms || []
  const floors = [...new Set(rooms.map(room => room.floor_number))].sort((a, b) => a - b)
  const total = key => rooms.reduce((sum, room) => sum + (Number(room[key]) || 0), 0)
  const stats = [
    ['Tổng số phòng', data?.summary.total, Building2, 'total'],
    ['Đang có tiết', data?.summary.inUse, CalendarDays, 'busy'],
    ['Trống theo lịch', data?.summary.available, DoorOpen, 'free'],
    ['Bảo trì / tạm ngưng', data?.summary.unavailable, Wrench, 'maintenance'],
  ]
  return <div className="building-page overview-page">
    <header className="building-heading"><div><p className="eyebrow">{user.role === 'ADMIN' ? 'Quản trị vận hành' : user.role === 'TEACHER' ? 'Giảng dạy & sử dụng phòng' : 'Tra cứu & hỗ trợ'} · {data?.building || 'Nhà A'}</p><h1>Tổng quan</h1><p>{user.role === 'ADMIN' ? 'Duyệt lịch, theo dõi sự cố và quản lý tình hình toàn dãy nhà.' : user.role === 'TEACHER' ? 'Theo dõi lịch của bạn, đăng ký phòng và mở thiết bị trong ca được duyệt.' : 'Tra cứu phòng học, theo dõi môi trường và báo sự cố cần hỗ trợ.'}</p></div><button onClick={resource.refresh} disabled={resource.refreshing}><RefreshCw size={16} className={resource.refreshing ? 'spin' : ''} />Làm mới</button></header>
    {resource.error && <div className="building-message is-error" role="alert">Chưa tải được tổng quan. {data ? 'Dữ liệu bên dưới là dữ liệu cũ.' : 'Vui lòng thử lại.'}</div>}
    <div className="building-summary">{stats.map(([label, value, Icon, tone]) => <article aria-label={label} className={`building-stat stat-${tone}`} key={label}><span className="building-stat-icon"><Icon size={22} /></span><div><span>{label}</span><strong>{value ?? '—'}</strong></div></article>)}</div>
    <section className="overview-attention" aria-label="Tình hình vận hành">
      <div><CalendarDays size={20} /><strong>{data ? data.summary.pending : '—'}</strong><span>Lịch giữ chỗ chờ duyệt · toàn dãy</span></div>
      <div><AlertCircle size={20} /><strong>{data ? total('open_incidents') : '—'}</strong><span>Tình trạng sự cố toàn dãy</span></div>
      <div><AlertCircle size={20} /><strong>{data ? total('active_alerts') : '—'}</strong><span>Cảnh báo đang mở</span></div>
      <div><Wifi size={20} /><strong>{data ? rooms.filter(room => room.sensor_status === 'ONLINE').length : '—'}</strong><span>Phòng có dữ liệu mới</span></div>
    </section>
    <WorkspacePanel />
    <div className="overview-section-heading"><div><h2>Chọn phòng để làm việc</h2><p>Xem lịch sử dụng hoặc mở cảm biến và thiết bị của đúng phòng.</p></div><Link className="action-button" to="/building">Tìm & quản lý phòng <ArrowUpRight size={16} /></Link></div>
    {resource.loading && <p role="status">Đang tải tổng quan dãy nhà…</p>}
    {data && rooms.length === 0 && <div className="building-empty">Chưa có phòng trong dãy nhà.</div>}
    {floors.map(floor => <section className="building-floor" key={floor}><header><span>Tầng {floor}</span><div /><small>{rooms.filter(room => room.floor_number === floor).length} phòng</small></header><div className="overview-room-grid">{rooms.filter(room => room.floor_number === floor).map(room => <article className="overview-room" key={room.id} aria-label={`Phòng ${room.id}`}>
      <div className="overview-room-title"><h3>Phòng {room.id}</h3><span className={`overview-status status-${room.usage_status}`}>{statuses[room.usage_status] || 'Chưa rõ trạng thái'}</span></div>
      <p>{room.name} · {room.capacity} chỗ</p>
      <p className="overview-booking">{room.current_booking ? `${room.current_booking.title} · Đến ${formatTime(room.current_booking.ends_at)}` : room.next_booking ? `Lịch tiếp: ${room.next_booking.title} · ${formatTime(room.next_booking.starts_at)}` : 'Chưa có lịch học tiếp theo'}</p>
      <p className="overview-connection"><Wifi size={15} />{connections[room.sensor_status] || 'Chưa rõ kết nối'}{Number(room.open_incidents) > 0 && <span> · {room.open_incidents} sự cố</span>}</p>
      <div className="overview-room-actions"><Link className="action-button" to={`/classroom?roomId=${room.id}`} aria-label={`Lịch & vận hành phòng ${room.id}`}>Lịch & vận hành</Link><Link className="action-button" to={`/iot/rooms/${room.id}`} aria-label={`Thiết bị phòng ${room.id}`}>Thiết bị <ArrowUpRight size={15} /></Link></div>
    </article>)}</div></section>)}
    <footer className="building-footnote">{data?.asOf ? `Cập nhật: ${formatTime(data.asOf, true)}. ` : ''}Tự cập nhật mỗi 15 giây khi trang đang hiển thị. Trạng thái sử dụng dựa trên lịch; kết nối IoT dựa trên mẫu đo gần nhất. Chọn phòng để kiểm tra trạng thái trực tiếp trước khi điều khiển.</footer>
  </div>
}
