import { useAuth } from '../../context/AuthContext.jsx'
import { Link } from 'react-router-dom'
import './iot.css'

const statuses = { Active: 'Đang hoạt động', Offline: 'Ngoại tuyến', Suspended: 'Tạm đình chỉ' }
export default function RoomDevices({ room }) {
  const { user } = useAuth()
  const devices = Array.isArray(room.devices) ? room.devices : []
  return <section className="room-devices" aria-label={`Danh sách thiết bị phòng ${room.id}`}>
    <div className="room-devices-heading"><h2>Thiết bị gắn với phòng {room.id}</h2>{room.sensorId && <Link className="action-button" to={`/history?roomId=${room.id}&deviceId=${encodeURIComponent(room.sensorId)}`}>Lịch sử cảm biến phòng</Link>}{user.role === 'ADMIN' && <Link className="action-button" to={`/admin?tab=devices&roomId=${room.id}`}>Quản lý thiết bị</Link>}</div>
    {devices.length ? <ul>{devices.map(device => <li key={device.device_id}><div><strong>{device.device_id}</strong><span>{device.type === 'SENSOR' ? 'Cảm biến' : device.type === 'ACTUATOR' ? 'Bộ điều khiển' : device.type}</span></div><span>{statuses[device.status] || device.status}</span><small>{device.device_id === room.sensorId ? 'Nguồn dữ liệu đang cấu hình' : device.device_id === room.actuatorId ? 'Bộ điều khiển đang cấu hình' : 'Đã đăng ký · Chưa có luồng IoT được cấu hình'}</small></li>)}</ul> : <p>Chưa có thiết bị đăng ký cho phòng này.</p>}
    <p>Trạng thái đăng ký thiết bị không thay thế trạng thái kết nối trực tiếp. Hiện luồng Node-RED hỗ trợ bộ điều khiển đã cấu hình với hai ngõ ra quạt và đèn; thiết bị mới cần được cấu hình tích hợp trước khi điều khiển.</p>
  </section>
}
