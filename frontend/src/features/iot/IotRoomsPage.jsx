import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Building2, Radio, RefreshCw, Search, Wifi, WifiOff } from 'lucide-react'
import { api } from '../../services/api/client.js'
import { usePollingResource } from '../dashboard/hooks/usePollingResource.js'
import '../building/building.css'
import './iot.css'

const installed = room => room.iot_enabled != null ? room.iot_enabled === true || room.iot_enabled === 1 : ['ONLINE', 'STALE', 'NO_DATA'].includes(room.sensor_status)
const roomStatuses = { ACTIVE: 'Đang hoạt động', MAINTENANCE: 'Đang bảo trì', INACTIVE: 'Tạm ngưng' }
export default function IotRoomsPage() {
  const [floor, setFloor] = useState(''), [search, setSearch] = useState(''), [installation, setInstallation] = useState('')
  const fetcher = useCallback(async signal => {
    const { data } = await api.get('/api/building/overview', { signal })
    if (data.success !== true || !Array.isArray(data.data?.rooms)) throw new Error('Invalid rooms response')
    return data.data
  }, [])
  const resource = usePollingResource(fetcher, 15000), all = resource.data?.rooms || []
  const floors = [...new Set(all.map(r => r.floor_number))].sort((a, b) => a - b)
  const rooms = all.filter(r => (!floor || r.floor_number === Number(floor)) && (!search || `${r.id} ${r.name}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))) && (!installation || (installation === 'installed' ? installed(r) : !installed(r))))
  return <div className="building-page iot-page">
    <header className="building-heading"><div><p className="eyebrow">Nhà A · Giám sát & điều khiển</p><h1>Điều khiển IoT</h1><p>Chọn một phòng để xem cảm biến, trạng thái thiết bị và quyền điều khiển của phòng đó.</p></div><button onClick={resource.refresh} disabled={resource.refreshing}><RefreshCw size={16} />Làm mới</button></header>
    <section className="iot-intro"><div className="iot-intro-icon"><Radio size={27} /></div><div><h2>Mỗi phòng, một không gian điều khiển</h2><p>Chọn phòng để xem thiết bị đã đăng ký và luồng IoT đang cấu hình. Phòng chưa tích hợp vẫn có trang riêng, hiển thị rõ trạng thái và khóa điều khiển.</p></div><Link className="action-button" to="/building"><Building2 size={16} />Quản lý Nhà A</Link></section>
    <div className="iot-summary"><span><strong>{all.length}</strong> phòng trong Nhà A</span><span><Wifi size={16} /><strong>{all.filter(r => installed(r)).length}</strong> phòng đã lắp IoT</span><span><WifiOff size={16} /><strong>{all.filter(r => !installed(r)).length}</strong> phòng chưa lắp</span></div>
    <section className="building-search-panel iot-filters" aria-label="Chọn phòng IoT"><label className="building-field"><span><Search size={14} /> Tìm phòng</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Số phòng hoặc tên phòng…" /></label><label className="building-field"><span>Tầng</span><select aria-label="Tầng" value={floor} onChange={e => setFloor(e.target.value)}><option value="">Tất cả tầng</option>{floors.map(f => <option key={f} value={f}>Tầng {f}</option>)}</select></label><label className="building-field"><span>Trang bị IoT</span><select aria-label="Trang bị IoT" value={installation} onChange={e => setInstallation(e.target.value)}><option value="">Tất cả phòng</option><option value="installed">Đã lắp IoT</option><option value="not-installed">Chưa lắp IoT</option></select></label></section>
    {resource.error && <div className="building-message is-error" role="alert">{resource.error.response?.data?.message || 'Chưa tải được danh sách phòng.'}{resource.data ? ' Danh sách đang hiển thị là dữ liệu cũ.' : ''}</div>}
    {resource.loading && <p role="status">Đang tải các phòng IoT…</p>}
    {!resource.loading && !rooms.length && !resource.error && <div className="building-empty">Không tìm thấy phòng phù hợp.</div>}
    {floors.filter(f => rooms.some(r => r.floor_number === f)).map(f => <section className="building-floor" key={f}><header><span>Tầng {f}</span><div /><small>{rooms.filter(r => r.floor_number === f).length} phòng</small></header><div className="iot-room-grid">{rooms.filter(r => r.floor_number === f).map(room => <Link className={`iot-room-link ${installed(room) ? 'iot-installed' : ''}`} key={room.id} to={`/iot/rooms/${room.id}`} aria-label={`Mở IoT phòng ${room.id}`}><div className="iot-card-top"><span className="iot-card-icon">{installed(room) ? <Wifi size={22} /> : <WifiOff size={22} />}</span><span className={installed(room) ? 'iot-chip installed' : 'iot-chip'}>{installed(room) ? 'Đã lắp ESP' : 'Chưa lắp IoT'}</span></div><h3>Phòng {room.id}</h3><p>{room.name} · {room.capacity} chỗ</p><div className="iot-card-status"><i className={room.status === 'ACTIVE' ? 'active' : ''} />{roomStatuses[room.status]}</div><div className="iot-card-description">{!installed(room) ? 'Chưa có cảm biến hoặc bộ điều khiển. Không sử dụng dữ liệu của phòng khác.' : room.sensor_status === 'ONLINE' ? 'Có mẫu đo mới. Mở phòng để đọc trạng thái trực tiếp và kiểm tra quyền điều khiển.' : 'Đã cấu hình thiết bị thật; hiện chưa có mẫu đo mới. Mở phòng để kiểm tra kết nối.'}</div><div className="iot-card-open"><span>Mở trang IoT của phòng</span><ArrowUpRight size={18} /></div></Link>)}</div></section>)}
    <p className="building-footnote">Đã lắp IoT không đồng nghĩa thiết bị đang online. Quyền điều khiển còn phụ thuộc ca được duyệt, tình trạng phòng và trạng thái thiết bị.</p>
  </div>
}
