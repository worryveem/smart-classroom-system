export default function SensorCard({ title, value, unit, icon: Icon, color, loading, stale, occupancy = false }) {
  const known = value !== null && value !== undefined
  const formatted = occupancy ? (value ? 'Có người' : 'Không có người') : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)
  return (
    <article className={`sensor-card sensor-${color}`} aria-label={title} aria-busy={loading}>
      <div className="sensor-card-top"><span>{title}</span><span className="sensor-icon"><Icon size={21} strokeWidth={1.7} aria-hidden="true" /></span></div>
      <p className={`sensor-value${occupancy ? ' occupancy-value' : ''}`}>{known ? formatted : '—'}{known && unit && <span>{unit}</span>}</p>
      <p className={`sensor-caption${stale ? ' is-stale' : ''}`}>{loading ? 'Đang tải dữ liệu' : !known ? 'Chưa có dữ liệu cảm biến' : stale ? 'Dữ liệu cũ · Chưa cập nhật được' : occupancy ? 'Ghi nhận từ cảm biến PIR' : 'Giá trị từ trạng thái thiết bị'}</p>
    </article>
  )
}
