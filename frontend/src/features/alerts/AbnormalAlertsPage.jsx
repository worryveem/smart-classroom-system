import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from 'lucide-react'
import { api } from '../../services/api/client.js'
import { formatTime } from '../../utils/dateTime.js'
import './alerts.css'

const number = value => typeof value === 'number' ? value.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : 'Chưa có số đo'
const device = value => value === true ? 'Đang bật' : value === false ? 'Đang tắt' : 'Chưa rõ trạng thái'
const labels = { ALERT: 'Cần kiểm tra', NORMAL: 'Không bất thường', UNKNOWN: 'Chưa đủ dữ liệu' }
const priority = { ALERT: 0, UNKNOWN: 1, NORMAL: 2 }
const ruleTitles = { HOT_FAN_OFF: 'Quạt khi nhiệt độ cao', COOL_FAN_ON: 'Quạt khi nhiệt độ thấp', DARK_LIGHT_OFF: 'Đèn khi thiếu sáng', BRIGHT_LIGHT_ON: 'Đèn khi đủ sáng' }

export default function AbnormalAlertsPage() {
  const [report, setReport] = useState(null), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); let timer
    async function load() {
      setLoading(true)
      try {
        const { data } = await api.get('/api/rooms/101/abnormal-alerts', { signal: controller.signal })
        if (!data.success || !Array.isArray(data.data?.rules) || data.data.rules.length !== 4 || data.data.rules.some(rule => !labels[rule.status])) throw new Error('Phản hồi không hợp lệ')
        if (!controller.signal.aborted) { setReport(data.data); setError('') }
      } catch (e) {
        if (!controller.signal.aborted) { setReport(null); setError(e.response?.data?.message || 'Chưa kiểm tra được cảnh báo. Hãy kiểm tra kết nối rồi thử lại.') }
      } finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(load, 10000) }
      }
    }
    load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [revision])
  const alerts = report?.rules.filter(rule => rule.status === 'ALERT').length || 0
  const unknown = report?.rules.filter(rule => rule.status === 'UNKNOWN').length || 0
  return <div className="abnormal-page">
    <header className="abnormal-heading"><div><p className="eyebrow">Theo dõi phòng 101</p><h1>Cảnh báo bất thường</h1><p>Kiểm tra điều kiện phòng so với trạng thái quạt và đèn.</p></div><button className="secondary-button" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} />Kiểm tra lại</button></header>
    {loading && <p role="status" className="abnormal-checking">Đang kiểm tra cảm biến và thiết bị…</p>}
    {error && <div className="abnormal-error" role="alert">{error}</div>}
    {report && <>
      <section className={`abnormal-summary ${alerts || unknown ? 'attention' : 'clear'}`} aria-live="polite">
        {alerts || unknown ? <AlertTriangle size={28} aria-hidden="true" /> : <CheckCircle2 size={28} aria-hidden="true" />}
        <div><h2>{alerts ? `${alerts} cảnh báo cần kiểm tra` : unknown ? 'Chưa đủ dữ liệu để kết luận' : 'Chưa phát hiện bất thường'}</h2><p>{unknown ? `${unknown} quy tắc chưa đánh giá được. ` : ''}Kiểm tra lúc {formatTime(report.checkedAt, true)}.</p></div>
        <Link className="primary-button" to="/iot/rooms/101">Mở điều khiển thiết bị</Link>
      </section>
      <dl className="abnormal-readings"><div><dt>Nhiệt độ</dt><dd>{number(report.temperature)}{report.temperature != null ? ' °C' : ''}</dd></div><div><dt>Ánh sáng{report.estimatedLight ? ' quy đổi' : ''}</dt><dd>{number(report.light)}{report.light != null ? ' lux' : ''}</dd></div><div><dt>Quạt</dt><dd>{device(report.fanOn)}</dd></div><div><dt>Đèn</dt><dd>{device(report.lightOn)}</dd></div></dl>
      {(!report.sensorReady || !report.actuatorReady || !report.synchronizedReadings) && <p className="abnormal-data-note">Chưa có đủ dữ liệu mới, đồng bộ từ cảm biến và bộ điều khiển. Các quy tắc liên quan sẽ hiển thị “Chưa đủ dữ liệu”, không coi là đã bình thường.</p>}
      <div className="abnormal-rules">{[...report.rules].sort((a, b) => priority[a.status] - priority[b.status]).map(rule => {
        const Icon = rule.status === 'ALERT' ? AlertTriangle : rule.status === 'NORMAL' ? CheckCircle2 : HelpCircle
        return <article key={rule.code} className={`abnormal-rule ${rule.status.toLowerCase()}`}><div className="abnormal-rule-title"><Icon size={22} aria-hidden="true" /><h2>{rule.status === 'ALERT' ? rule.title : ruleTitles[rule.code] || rule.title}</h2></div><span className={`abnormal-badge ${rule.status.toLowerCase()}`}>{labels[rule.status]}</span><p>{rule.message}</p>
          <dl><div><dt>Số đo</dt><dd>{number(rule.value)}{rule.value != null ? ` ${rule.unit}` : ''}</dd></div><div><dt>Ngưỡng so sánh</dt><dd>{number(rule.threshold)} {rule.unit}</dd></div><div><dt>{rule.code.includes('FAN') ? 'Quạt' : 'Đèn'}</dt><dd>{device(rule.deviceOn)}</dd></div></dl>
          {rule.status === 'ALERT' && <p className="abnormal-advice"><strong>Gợi ý: </strong>{rule.recommendation}</p>}
        </article>
      })}</div>
      {report.estimatedLight && <p className="abnormal-data-note">Ánh sáng hiện là giá trị quy đổi/chưa hiệu chuẩn. Cảnh báo đèn dựa trên thang này; hãy đối chiếu ánh sáng thực tế trước khi thao tác.</p>}
      <p className="abnormal-footnote">Tự kiểm tra lại mỗi 10 giây khi trang đang mở. Dùng ngưỡng đã lưu trong <Link to="/automation">Chế độ tự động</Link>, kể cả khi chế độ đó đang tắt. Cảnh báo không tự bật/tắt thiết bị và không kết luận phòng có người.</p>
    </>}
  </div>
}
