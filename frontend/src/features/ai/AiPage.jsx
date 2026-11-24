import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowUpRight, BrainCircuit, Droplets, Radar, RefreshCw, Sun, Thermometer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api/client.js'
import { formatTime } from '../../utils/dateTime.js'
import './ai.css'
import OccupancyPanel from './OccupancyDemoPanel.jsx'

function unwrap(response) {
  if (!response.data?.success || response.data.data == null) throw new Error('Phản hồi không hợp lệ')
  return response.data.data
}
const labelFor = label => label === 'ANOMALY' ? 'Cần kiểm tra' : 'Chưa thấy bất thường'
const motionFor = motion => motion === true ? 'Có chuyển động' : motion === false ? 'Chưa có chuyển động' : 'Chưa có dữ liệu'

function Readings({ result }) {
  const light = result.anomaly?.light_conversion?.light
  return <dl className="ai-readings"><div><dt><Thermometer size={15} />Nhiệt độ</dt><dd>{result.input.temp} °C</dd></div><div><dt><Droplets size={15} />Độ ẩm</dt><dd>{result.input.humidity} %</dd></div><div><dt><Sun size={15} />Ánh sáng</dt><dd>{light === true ? 'Sáng' : light === false ? 'Tối' : 'Chưa xác định'}</dd></div><div><dt><Radar size={15} />PIR</dt><dd>{motionFor(result.input.motion)}</dd></div></dl>
}

function Explanation({ anomaly }) {
  const items = anomaly.explanation?.items || []
  return <div className="ai-reason-box"><h4>Vì sao model cảnh báo?</h4>
    {items.length ? <ul>{items.map(item => <li key={item.feature}><strong>{item.title}</strong><p>{item.detail}</p></li>)}</ul> : <p>{anomaly.explanation?.summary || 'Bản ghi này chưa có phân tích yếu tố. Hãy phân tích lại để xem lý do.'}</p>}
    <small>Phép thử của model, không phải nguyên nhân hay ngưỡng điều khiển.</small>
  </div>
}

export default function AiPage() {
  const [status, setStatus] = useState(null), [history, setHistory] = useState([])
  const [result, setResult] = useState(null), [threshold, setThreshold] = useState('4000')
  const [highIsBright, setHighIsBright] = useState(false)
  const [loading, setLoading] = useState(true), [running, setRunning] = useState(false)
  const [error, setError] = useState(''), [historyError, setHistoryError] = useState('')
  const [revision, setRevision] = useState(0)
  const alive = useRef(false), busy = useRef(false), request = useRef(null)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; request.current?.abort() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setHistoryError('')
    async function load() {
      const responses = await Promise.allSettled([
        api.get('/api/ai/rooms/101/status', { signal: controller.signal }).then(unwrap),
        api.get('/api/ai/rooms/101/history', { signal: controller.signal }).then(unwrap),
      ])
      if (controller.signal.aborted) return
      if (responses[0].status === 'fulfilled') setStatus(responses[0].value)
      else { setStatus(null); setError(responses[0].reason.response?.data?.message || 'Chưa tải được trạng thái AI. Vui lòng thử lại.') }
      if (responses[1].status === 'fulfilled' && Array.isArray(responses[1].value)) setHistory(responses[1].value)
      else setHistoryError('Chưa tải được lịch sử phân tích. Bạn có thể thử tải lại.')
      setLoading(false)
    }
    load()
    return () => controller.abort()
  }, [revision])

  async function analyze(event) {
    event.preventDefault()
    if (busy.current) return
    const value = Number(threshold)
    if (threshold === '' || !Number.isInteger(value) || value < 1 || value > 4094) {
      setError('Ngưỡng ADC phải là số nguyên từ 1 đến 4094.'); return
    }
    busy.current = true; setRunning(true); setResult(null); setError('')
    const controller = new AbortController(); request.current = controller
    try {
      const next = unwrap(await api.post('/api/ai/rooms/101/analyze', { threshold: value, highIsBright }, { signal: controller.signal }))
      if (!next.anomaly || !['NORMAL', 'ANOMALY'].includes(next.anomaly.label)) throw new Error('Phản hồi không hợp lệ')
      if (!alive.current) return
      setResult(next)
      try {
        const rows = unwrap(await api.get('/api/ai/rooms/101/history', { signal: controller.signal }))
        if (alive.current && Array.isArray(rows)) { setHistory(rows); setHistoryError('') }
      } catch {
        if (alive.current && !controller.signal.aborted) setHistoryError('Đã phân tích và lưu kết quả, nhưng chưa tải lại được lịch sử.')
      }
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError(e.response?.data?.message || 'Chưa phân tích được dữ liệu. Kiểm tra kết nối rồi thử lại.')
    } finally { busy.current = false; if (alive.current) setRunning(false) }
  }
  const models = status?.service?.models
  return <div className="ai-page">
    <header className="ai-heading"><div><div className="ai-heading-label"><BrainCircuit size={17} /><span>Phòng 101</span></div><h1>Gợi ý AI</h1><p>Phân tích số đo mới nhất của phòng.</p></div><div className="ai-heading-actions"><Link className="secondary-button" to="/iot/rooms/101">Cảm biến<ArrowUpRight size={16} /></Link><button className="secondary-button" disabled={loading || running} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} />Tải lại</button></div></header>
    {error && <p className="ai-error" role="alert">{error}</p>}
    {loading && <p role="status">Đang tải trạng thái AI…</p>}
    <div className="ai-workbench">
    <section className="ai-card ai-model-one" aria-labelledby="anomaly-title">
      <div className="ai-model-head"><div className="ai-model-icon"><Activity size={24} /></div><div><span className="ai-model-number">Model 01</span><h2 id="anomaly-title">Phát hiện bất thường</h2></div></div>
      <div className="ai-model-status"><span className={`ai-status-dot ${models?.anomaly ? 'ready' : ''}`} />{loading ? 'Đang kiểm tra' : models?.anomaly ? 'Sẵn sàng phân tích' : 'AI chưa kết nối'}</div>
      <form className="ai-analysis" onSubmit={analyze}>
      <button className="primary-button ai-analyze-button" type="submit" disabled={loading || running || !models?.anomaly}><Activity size={17} />{running ? 'Đang phân tích…' : 'Phân tích model 1'}</button>
      <details className="ai-technical ai-settings"><summary>Cài đặt ánh sáng</summary>
      <div className="ai-fields"><label>Ngưỡng ADC sáng/tối<input type="number" min="1" max="4094" step="1" required value={threshold} disabled={running} onChange={e => setThreshold(e.target.value)} /></label>
        <label>Chiều biến thiên ADC<select value={highIsBright ? 'high' : 'low'} disabled={running} onChange={e => setHighIsBright(e.target.value === 'high')}><option value="low">ADC thấp hơn ngưỡng là sáng</option><option value="high">ADC từ ngưỡng trở lên là sáng</option></select></label></div>
      <p className="ai-hint">4000 là mốc thử ban đầu. Quy ước sáng/tối chưa xác minh tương đương dữ liệu huấn luyện.</p>
      </details>
      </form>
      {result ? <div className={`ai-result ${result.anomaly.label === 'ANOMALY' ? 'warning' : 'normal'}`} aria-live="polite"><div className="ai-result-heading"><span className={`ai-badge ${result.anomaly.label === 'NORMAL' ? 'ready' : ''}`}>Theo model</span><time>{formatTime(result.sampledAt)}</time></div><h3>{labelFor(result.anomaly.label)}</h3><Readings result={result} />
        {result.anomaly.label === 'ANOMALY' && <Explanation anomaly={result.anomaly} />}
        <details className="ai-technical"><summary>Chi tiết phân tích</summary><p className="ai-hint">Mẫu lúc {formatTime(result.sampledAt, true)} · ADC {result.input.ldr_adc} · Ngưỡng {result.input.threshold} · Điểm quyết định: {Number(result.anomaly.decision_score).toFixed(4)}</p>{result.anomaly.explanation?.notice && <p className="ai-hint">{result.anomaly.explanation.notice}</p>}<p className="ai-hint">{result.anomaly.notice}</p><p className="ai-hint">PIR không dùng để đếm người hoặc khẳng định phòng trống.</p></details>
      </div> : <div className="ai-model-empty"><Activity size={35} strokeWidth={1.2} /><p>Chưa phân tích</p><small>Kết quả và lý do sẽ xuất hiện tại đây.</small></div>}
    </section>
    <OccupancyPanel ready={status?.occupancyLiveReady === true} busy={running || loading} />
    </div>
    <p className="ai-page-note">Kết quả tham khảo. Không tự điều khiển thiết bị.</p>
    {historyError && <p role="alert" className="ai-error">{historyError}</p>}
    <details className="ai-card ai-history"><summary><span>Lịch sử phân tích</span><span className="ai-history-count">{history.length} kết quả</span></summary>
      {!loading && !historyError && history.length === 0 && <p className="ai-empty">Chưa có kết quả. Bắt đầu bằng cách phân tích mẫu mới nhất.</p>}
      <div className="ai-history-list">{history.map(row => <article key={row.id} className="ai-history-row"><div><time>{formatTime(row.result.analyzedAt, true)}</time><strong>{labelFor(row.result.anomaly.label)}</strong><p>{row.result.input.temp} °C · Độ ẩm {row.result.input.humidity}% · {row.result.anomaly.light_conversion.light ? 'Sáng' : 'Tối'}</p><small>{motionFor(row.result.input.motion)}</small></div><span className={`ai-badge ${row.result.anomaly.label === 'NORMAL' ? 'ready' : ''}`}>{row.result.anomaly.label === 'NORMAL' ? 'Tiếp tục theo dõi' : 'Cần kiểm tra'}</span></article>)}</div>
    </details>
  </div>
}
