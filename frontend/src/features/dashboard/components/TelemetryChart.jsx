import { useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatTime, stateError } from '../services/dashboardService.js'

const series = [
  { key: 'temp', name: 'Nhiệt độ', unit: '°C', color: '#bf5a36' },
  { key: 'humid', name: 'Độ ẩm', unit: '%', color: '#4658d6' },
  { key: 'lux', name: 'Ánh sáng', unit: 'Lux', color: '#9c731c' },
]
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{formatTime(label, true)}</strong>{payload.filter(row => row.value !== null).map(row => {
    const item = series.find(item => item.key === row.dataKey)
    return <p key={row.dataKey}><span style={{ color: item.color }}>{item.name}</span><b>{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(row.value)} {item.unit}</b></p>
  })}</div>
}
export default function TelemetryChart({ history, range, setRange }) {
  const [visible, setVisible] = useState({ temp: true, humid: true, lux: true })
  const rows = history.data?.rows ?? []
  const selected = Object.values(visible).some(Boolean)
  return (
    <section className="dashboard-panel telemetry-panel" aria-label="Biểu đồ cảm biến">
      <div className="panel-heading"><h2>Diễn biến cảm biến</h2>
        <div className="chart-toolbar"><select aria-label="Khoảng thời gian" value={range} onChange={event => setRange(event.target.value)}>
          <option value="recent">50 mẫu gần nhất</option><option value="1h">1 giờ qua</option><option value="6h">6 giờ qua</option><option value="24h">24 giờ qua</option>
        </select><button className="icon-button" aria-label="Tải lại lịch sử" disabled={history.refreshing} onClick={history.refresh}><RefreshCw size={16} className={history.refreshing ? 'spin' : ''} /></button></div>
      </div>
      <div className="chart-legend">{series.map(item => <label key={item.key}><input type="checkbox" checked={visible[item.key]} onChange={() => setVisible(previous => ({ ...previous, [item.key]: !previous[item.key] }))} /><span className="legend-dot" style={{ background: item.color }} />{item.name}<span className="legend-unit">{item.unit}</span></label>)}</div>
      {history.error && <p className="inline-warning" role="alert">{stateError(history.error)}{rows.length > 0 && ' Đang hiển thị lịch sử đã tải trước đó.'}</p>}
      <div className="chart-area" aria-busy={history.loading}>
        {history.loading ? <div className="chart-empty" role="status"><Activity size={27} /><p>Đang tải lịch sử cảm biến…</p></div>
          : !rows.length ? <div className="chart-empty"><Activity size={30} strokeWidth={1.3} /><h3>{history.error ? 'Chưa tải được lịch sử' : 'Chưa có dữ liệu trong khoảng này'}</h3><p>Chọn khoảng thời gian khác hoặc tải lại lịch sử.</p></div>
          : !selected ? <div className="chart-empty"><p>Chọn ít nhất một thông số để xem biểu đồ.</p></div>
          : <ResponsiveContainer width="100%" height={280} minWidth={0}>
            <LineChart data={rows} margin={{ top: 12, right: 8, bottom: 5, left: -10 }} accessibilityLayer>
              <CartesianGrid stroke="#e5e9f3" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} padding={{ left: 8, right: 8 }} tickFormatter={value => formatTime(value)} tick={{ fontSize: 10, fill: '#65718a' }} axisLine={false} tickLine={false} minTickGap={45} />
              <YAxis yAxisId="main" hide={!visible.temp && !visible.humid} tick={{ fontSize: 10, fill: '#65718a' }} axisLine={false} tickLine={false} width={48} />
              <YAxis yAxisId="lux" orientation="right" hide={!visible.lux} tick={{ fontSize: 10, fill: '#916015' }} axisLine={false} tickLine={false} width={48} unit=" lx" />
              <Tooltip content={<ChartTooltip />} />
              {series.filter(item => visible[item.key]).map(item => <Line key={item.key} dataKey={item.key} name={item.name} yAxisId={item.key === 'lux' ? 'lux' : 'main'} stroke={item.color} strokeWidth={2.2} dot={rows.length < 8 ? { r: 3 } : false} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} type="linear" />)}
            </LineChart>
          </ResponsiveContainer>}
      </div>
      <div className="chart-footer"><span>{rows.length} mẫu hợp lệ · Giờ Việt Nam (UTC+07)</span><span>{history.receivedAt ? `Lần đọc: ${formatTime(history.receivedAt)}` : 'Chưa tải lịch sử'}</span></div>
      {history.data?.limited && <p className="chart-note">Đã chạm giới hạn {range === 'recent' ? '50' : '500'} mẫu mới nhất; biểu đồ có thể chưa bao phủ toàn bộ khoảng đã chọn.</p>}
      {history.data?.omitted > 0 && <p className="chart-note">Bỏ qua {history.data.omitted} bản ghi không khớp thiết bị hoặc thiếu thời gian/giá trị hợp lệ.</p>}
    </section>
  )
}
