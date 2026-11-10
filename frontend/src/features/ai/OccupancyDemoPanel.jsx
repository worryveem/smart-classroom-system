import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api/client.js'
import { formatTime } from '../../utils/dateTime.js'
import { Users } from 'lucide-react'

const labels = { EMPTY: 'Trống', LOW: 'Ít người', CROWDED: 'Đông người' }
export default function OccupancyPanel({ ready, busy: parentBusy }) {
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const request = useRef(null), locked = useRef(false)
  useEffect(() => () => request.current?.abort(), [])
  async function analyze(event) {
    event.preventDefault()
    if (locked.current) return
    locked.current = true; setBusy(true); setError(''); setResult(null)
    const controller = new AbortController(); request.current = controller
    try {
      const { data } = await api.post('/api/ai/rooms/101/occupancy-live', undefined, { signal: controller.signal })
      if (!data.success || data.data?.prediction?.data_source !== 'CURRENT_SENSOR' || !labels[data.data.prediction.label]) throw new Error('Phản hồi không hợp lệ')
      if (!controller.signal.aborted) setResult(data.data)
    } catch (e) { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Chưa phân tích được mức hiện diện. Vui lòng thử lại.') }
    finally { locked.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  const prediction = result?.prediction
  const label = labels[prediction?.label]
  return <section className="ai-card ai-model-two" aria-labelledby="occupancy-demo-title">
    <div className="ai-model-head"><div className="ai-model-icon"><Users size={24} /></div><div><span className="ai-model-number">Model 02</span><h2 id="occupancy-demo-title">Mức hiện diện</h2></div></div>
    <div className="ai-model-status"><span className={`ai-status-dot ${ready ? 'ready' : ''}`} />{ready ? 'Sẵn sàng ước tính' : 'AI chưa kết nối'}</div>
    <form onSubmit={analyze}>
      <button className="primary-button ai-analyze-button" disabled={busy || parentBusy || !ready} type="submit"><Users size={17} />{busy ? 'Đang phân tích…' : 'Phân tích model 2'}</button>
    </form>
    {error && <p className="ai-error" role="alert">{error}</p>}
    {label ? <div className={`ai-demo-result ${prediction.label.toLowerCase()}`} aria-live="polite"><div className="ai-result-heading"><span className="ai-badge">Ước tính</span><time>{formatTime(result.sampledAt)}</time></div><h3>{label}</h3>
      <div className="ai-presence-scale" aria-hidden="true"><span className={prediction.label === 'EMPTY' ? 'active' : ''}>Trống</span><span className={prediction.label === 'LOW' ? 'active' : ''}>Ít người</span><span className={prediction.label === 'CROWDED' ? 'active' : ''}>Đông người</span></div>
      <div className="ai-caveats">{prediction.estimated_light && <span>Ánh sáng chưa hiệu chuẩn</span>}{prediction.out_of_training_range && <span>Ngoài phạm vi đã học</span>}</div>
      <details className="ai-technical"><summary>Số đo và giới hạn</summary><p className="ai-hint">Mẫu lúc {formatTime(result.sampledAt, true)}. Nhiệt độ: {prediction.features.temp_mean} °C · Ánh sáng đầu vào: {prediction.features.light_mean} · PIR: {prediction.features.pir_active ? 'có chuyển động' : 'không chuyển động'} · Giờ: {prediction.features.hour}h.</p><p className="ai-hint">Kết quả chưa được kiểm chứng tại phòng, không dùng để đếm người.</p>{prediction.notices?.map(notice => <p className="ai-hint" key={notice}>{notice}</p>)}</details>
    </div> : <div className="ai-model-empty"><Users size={35} strokeWidth={1.2} /><p>Chưa phân tích</p><small>Trống, ít người hoặc đông người.</small></div>}
  </section>
}
