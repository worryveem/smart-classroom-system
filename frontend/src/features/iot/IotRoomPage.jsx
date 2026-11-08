import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { AlertCircle, Droplets, Lightbulb, Thermometer, Users, WifiOff } from 'lucide-react'
import { api } from '../../services/api/client.js'
import DashboardPage from '../dashboard/pages/DashboardPage.jsx'
import SensorCard from '../dashboard/components/SensorCard.jsx'
import DeviceControl from '../dashboard/components/DeviceControl.jsx'
import '../dashboard/dashboard.css'
import './iot.css'

function RoomContent({ roomId }) {
  const [room, setRoom] = useState(null), [error, setError] = useState(null), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setRoom(null); setError(null)
    if (!Number.isInteger(roomId) || roomId < 100 || roomId > 9999) { setError('Số phòng không hợp lệ.'); return () => controller.abort() }
    api.get(`/api/iot/rooms/${roomId}`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      if (data.success !== true || data.data?.id !== roomId || typeof data.data.iotEnabled !== 'boolean') throw new Error('Phản hồi phòng không hợp lệ')
      setRoom(data.data)
    }).catch(error => { if (!axios.isCancel(error) && !controller.signal.aborted) setError(error.response?.data?.message || 'Chưa tải được cấu hình IoT của phòng. Vui lòng thử lại.') })
    return () => controller.abort()
  }, [roomId, retry])
  if (error) return <section className="iot-room-error" role="alert"><AlertCircle size={30} /><h1>Không mở được IoT phòng {Number.isFinite(roomId) ? roomId : ''}</h1><p>{error}</p><button onClick={() => setRetry(v => v + 1)}>Thử lại</button><Link to="/iot">Quay lại danh sách phòng</Link></section>
  if (!room) return <p role="status">Đang tải IoT phòng {roomId}…</p>
  if (room.iotEnabled) return <DashboardPage key={roomId} room={room} />
  const reason = `Phòng ${roomId} chưa kết nối IoT. Không thể gửi lệnh điều khiển.`
  return <div className="dashboard iot-unconnected">
    <header className="dashboard-heading"><div><p className="eyebrow">Nhà A · Phòng {roomId}</p><h1>IoT phòng {roomId}</h1><p>{room.name} · Tầng {room.floor_number} · {room.capacity} chỗ</p><Link className="iot-back" to="/iot">← Chọn phòng IoT khác</Link></div><Link className="iot-context-link" to={`/classroom?roomId=${roomId}`}>Lịch & vận hành phòng {roomId}</Link></header>
    <section className="iot-not-installed" role="status"><WifiOff size={32} /><div><h2>Phòng {roomId} chưa kết nối IoT</h2><p>Chưa có cảm biến hoặc bộ điều khiển gắn với phòng này. Các chỉ số để trống, nút điều khiển bị khóa; hệ thống không đọc dữ liệu hoặc gửi lệnh sang phòng 101.</p></div></section>
    {room.status !== 'ACTIVE' && <div className="dashboard-alert"><AlertCircle size={20} /><p>Phòng đang {room.status === 'MAINTENANCE' ? 'bảo trì' : 'tạm ngưng'}: {room.maintenance_note || 'Liên hệ quản trị viên để biết thêm.'}</p></div>}
    <div className="sensor-grid"><SensorCard title="Nhiệt độ" value={null} unit="°C" icon={Thermometer} color="orange" /><SensorCard title="Độ ẩm" value={null} unit="%" icon={Droplets} color="blue" /><SensorCard title="Ánh sáng" value={null} unit="Lux" icon={Lightbulb} color="gold" /><SensorCard title="Chuyển động PIR" value={null} icon={Users} color="teal" occupancy /></div>
    <div className="dashboard-columns"><section className="dashboard-panel iot-empty-history"><WifiOff size={35} /><h2>Chưa có lịch sử cảm biến</h2><p>Biểu đồ chỉ xuất hiện khi phòng được kết nối với thiết bị thật.</p><Link to={`/classroom?roomId=${roomId}`}>Xem lịch học và báo cáo phòng {roomId}</Link></section><section className="dashboard-panel control-panel"><div className="panel-heading"><h2>Điều khiển thiết bị</h2></div><p className="panel-subtitle">Chưa có thiết bị trong phòng {roomId}</p>{['FAN', 'LIGHT'].map(target => <DeviceControl key={target} target={target} state={null} stale={false} pending={null} control={() => {}} permissionDenied disabledReason={reason} />)}</section></div>
  </div>
}
export default function IotRoomPage() {
  const { roomId } = useParams()
  return <RoomContent key={roomId} roomId={Number(roomId)} />
}
