import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertCircle, Clock3, Droplets, Lightbulb, Radio, RefreshCw, Thermometer, Users, Workflow } from 'lucide-react'
import SensorCard from '../components/SensorCard.jsx'
import DeviceControl from '../components/DeviceControl.jsx'
import { ConnectionBadge } from '../components/DeviceStatus.jsx'
import TelemetryChart from '../components/TelemetryChart.jsx'
import { useDeviceState } from '../hooks/useDeviceState.js'
import { useTelemetry } from '../hooks/useTelemetry.js'
import { useControl } from '../hooks/useControl.js'
import { formatTime, stateError } from '../services/dashboardService.js'
import { ACTUATOR_ID, SENSOR_ID } from '../services/stateAdapter.js'
import '../dashboard.css'
import { useControlPermission } from '../../classroom/useControlPermission.js'

export default function DashboardPage({ room }) {
  const roomId = room?.id || 101
  const scope = useMemo(() => room ? { roomId: room.id, sensorId: room.sensorId, actuatorId: room.actuatorId } : undefined, [room])
  const state = useDeviceState(scope)
  const permission = useControlPermission(roomId)
  const [range, setRange] = useState('recent')
  const history = useTelemetry(range, scope)
  const { pending, result, control } = useControl(state.refresh, scope)
  const data = state.data
  const stale = Boolean(state.error)
  const sensorStale = stale || data?.sensorConnected === false
  const actuatorStale = stale || data?.actuatorConnected === false
  return (
    <div className="dashboard">
      <header className="dashboard-heading">
        <div><p className="eyebrow">Nhà A · Phòng {roomId} · ESP thật</p><h1>{room ? `IoT phòng ${roomId}` : 'Tổng quan'}</h1><p>{room?.name || 'Phòng 101'} · Theo dõi môi trường và điều khiển thiết bị.</p><Link className="classroom-back" to="/iot">← Chọn phòng IoT khác</Link><span> · </span><Link className="classroom-back" to={`/classroom?roomId=${roomId}`}>Lịch & vận hành phòng</Link></div>
        <button className="dashboard-refresh" disabled={state.refreshing} onClick={state.refresh}><RefreshCw size={16} className={state.refreshing ? 'spin' : ''} />Làm mới trạng thái</button>
      </header>
      <div className="state-summary"><span className={`state-indicator ${stale ? 'state-error' : data ? 'state-ready' : ''}`}><Radio size={14} />{stale ? 'Mất kết nối dữ liệu IoT' : state.loading ? 'Đang đọc trạng thái' : 'Đã nhận State'}</span><span><Clock3 size={13} />{state.receivedAt ? `Lần đọc thành công: ${formatTime(state.receivedAt)}` : 'Chưa có lần đọc thành công'}</span></div>
      {state.error && <div className="dashboard-alert" role="alert"><AlertCircle size={19} /><div><strong>{stateError(state.error)}</strong><p>{data ? 'Các giá trị bên dưới là dữ liệu cũ, không phải trạng thái hiện tại.' : 'Chưa có dữ liệu trực tiếp từ thiết bị.'} Tự đọc lại sau mỗi lượt chờ 4 giây; điều khiển đang tạm khóa.</p></div></div>}
      {data && !data.recognized && <div className="dashboard-alert" role="alert"><AlertCircle size={19} /><div><strong>Chưa nhận diện được cấu trúc State.</strong><p>Cần đối chiếu dữ liệu của flow hiện tại. Các trường chưa rõ được giữ trống, không thay bằng giá trị giả.</p></div></div>}
      <div className="sensor-grid">
        <SensorCard title="Nhiệt độ" value={data?.temp} unit="°C" icon={Thermometer} color="orange" loading={state.loading} stale={sensorStale} />
        <SensorCard title="Độ ẩm" value={data?.humid} unit="%" icon={Droplets} color="blue" loading={state.loading} stale={sensorStale} />
        <SensorCard title="Ánh sáng" value={data?.lux} unit="Lux" icon={Lightbulb} color="gold" loading={state.loading} stale={sensorStale} />
        <SensorCard title="Chuyển động PIR" value={data?.occupancy} icon={Users} color="teal" loading={state.loading} stale={sensorStale} occupancy />
      </div>
      <div className="dashboard-columns">
        <TelemetryChart history={history} range={range} setRange={setRange} />
        <section className="dashboard-panel control-panel" aria-label="Điều khiển thiết bị">
          <div className="panel-heading"><div><p className="eyebrow">Thiết bị trong lớp</p><h2>Điều khiển</h2></div><Activity size={19} color="#91aaa9" /></div>
          <p className="panel-subtitle">Bộ điều khiển <code>{room?.actuatorId || ACTUATOR_ID}</code></p>
          <p className="panel-subtitle" role="status">{permission.error ? 'Chưa kiểm tra được quyền điều khiển.' : permission.data?.reason || 'Đang kiểm tra quyền điều khiển…'}</p>
          <DeviceControl target="FAN" state={data} stale={actuatorStale} pending={pending} control={control} permissionDenied={permission.error || !permission.data?.allowed} />
          <DeviceControl target="LIGHT" state={data} stale={actuatorStale} pending={pending} control={control} permissionDenied={permission.error || !permission.data?.allowed} />
          {result && <div className={`command-result result-${result.tone}`} role="status" aria-live="polite"><strong>{result.target} · {result.action} · {result.status}</strong><p>{result.message}</p></div>}
          <div className="auto-status"><Workflow size={20} /><div><strong>Chế độ AUTO <span>{data?.auto === true ? 'Đang bật' : data?.auto === false ? 'Đang tắt' : 'Chưa có trạng thái'}</span></strong><p>Chỉ hiển thị khi có dữ liệu. Chưa hỗ trợ chuyển chế độ từ giao diện.</p></div></div>
        </section>
      </div>
      <footer className="sensor-source"><div><Activity size={16} /><span>Nguồn cảm biến <code>{room?.sensorId || SENSOR_ID}</code></span><ConnectionBadge connected={data?.sensorConnected} /></div><span>{data?.sensorTimestamp ? `Thời điểm State: ${formatTime(data.sensorTimestamp, true)}` : 'API chưa cung cấp thời điểm cập nhật của cảm biến'}</span></footer>
    </div>
  )
}
