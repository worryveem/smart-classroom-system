import { useEffect, useRef, useState } from 'react'
import { Fan, Lightbulb, Info, RefreshCw, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api/client.js'
import { formatTime } from '../../utils/dateTime.js'
import './automation.css'

const fields = [
  ['fanOn', 'Bật quạt từ (°C)', 10, 50, .5], ['fanOff', 'Tắt quạt từ (°C) trở xuống', 5, 45, .5],
  ['lightOn', 'Bật đèn từ (lux) trở xuống', 0, 100000, 1], ['lightOff', 'Tắt đèn từ (lux)', 0, 100000, 1],
  ['emptySeconds', 'Tắt khi không chuyển động liên tục (giây)', 60, 3600, 1],
]
function draftFor(data) {
  return { fanOn: data.fan_on, fanOff: data.fan_off, lightOn: data.light_on, lightOff: data.light_off, emptySeconds: data.empty_seconds }
}
export default function AutomationPage() {
  const [settings, setSettings] = useState(null), [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0)
  const mounted = useRef(false), operation = useRef(false), dirty = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const { data } = await api.get('/api/automation', { signal: controller.signal })
        if (!data.success || typeof data.data?.enabled !== 'boolean') throw new Error('Phản hồi không hợp lệ')
        if (!controller.signal.aborted && !operation.current) {
          setSettings(data.data)
          if (!dirty.current) setDraft(draftFor(data.data))
          setError('')
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e.response?.data?.message || 'Chưa tải được trạng thái. Vui lòng thử lại.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    setLoading(true); load()
    const timer = setInterval(load, 15000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [revision])

  async function save(enabled, useDraft = true) {
    if (operation.current || !settings || !draft) return
    const values = useDraft ? draft : draftFor(settings)
    if (Object.values(values).some(value => value === '' || !Number.isFinite(Number(value))) || Number(values.fanOff) >= Number(values.fanOn) || Number(values.lightOn) >= Number(values.lightOff)) {
      setError('Ngưỡng tắt quạt phải nhỏ hơn ngưỡng bật; ngưỡng bật đèn phải nhỏ hơn ngưỡng tắt. Điền đầy đủ các giá trị.'); return
    }
    operation.current = true; setSaving(true); setError(''); setNotice('')
    try {
      const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]))
      const { data } = await api.put('/api/automation', { ...payload, enabled })
      if (!data.success || data.data?.enabled !== enabled) throw new Error('Phản hồi không hợp lệ')
      if (mounted.current) {
        setSettings(data.data); setDraft(draftFor(data.data)); dirty.current = false
        setNotice(enabled ? 'Đã bật tự động cho phòng 101. Hệ thống sẽ kiểm tra cảm biến trước khi gửi lệnh.' : 'Đã tắt tự động. Thiết bị giữ nguyên trạng thái; bạn có thể điều khiển thủ công.')
      }
    } catch (e) {
      if (mounted.current) setError(e.response?.data?.message || 'Chưa lưu được thay đổi. Trạng thái trước đó được giữ nguyên.')
    } finally { operation.current = false; if (mounted.current) setSaving(false) }
  }

  const enabled = settings?.enabled === true
  const unavailable = loading || saving || !settings?.canConfigure || !!error
  return <div className="automation-page">
    <header className="automation-heading"><div><h1>Chế độ tự động</h1><p>Điều khiển quạt và đèn theo cảm biến tại phòng 101.</p></div><span className="automation-tag">Phòng 101</span></header>
    {error && <div className="automation-error" role="alert"><span>{error}</span><button className="secondary-button" disabled={saving} onClick={() => { setError(''); setRevision(v => v + 1) }}><RefreshCw size={16} />Thử lại</button></div>}
    {notice && <p className="automation-notice" role="status">{notice}</p>}
    {loading && !settings ? <p role="status">Đang tải cấu hình…</p> : <>
      <section className={`automation-control${enabled ? ' enabled' : ''}`} aria-labelledby="automation-title">
        <div className="automation-symbol"><Fan size={34} aria-hidden="true" /></div>
        <div className="automation-control-copy"><h2 id="automation-title">Tự động bật/tắt quạt và đèn</h2><p>Áp dụng chung cho phòng 101, kể cả khi bạn đóng trang này.</p><span className="automation-state">{settings ? enabled ? 'Đang bật tự động' : 'Đang ở chế độ thủ công' : 'Chưa tải được trạng thái'}</span></div>
        <button type="button" className="automation-switch" role="switch" aria-label="Tự động bật/tắt quạt và đèn" aria-checked={enabled} disabled={unavailable} onClick={() => save(!enabled, !enabled)}><span /></button>
        {saving && <span className="automation-saving" role="status">Đang lưu…</span>}
      </section>
      <aside className="automation-integration"><Info size={21} aria-hidden="true" /><div><strong>{settings?.message || 'Chưa có trạng thái vận hành'}</strong><p>{settings?.checked_at ? `Kiểm tra gần nhất: ${formatTime(settings.checked_at, true)}. ` : ''}Dữ liệu cảm biến phải mới trong 60 giây. Khi mất kết nối hoặc lệnh chưa xác nhận, hệ thống dừng tự động và không gửi lại lệnh.</p></div></aside>
      {settings && !settings.canConfigure && <p className="automation-error" role="alert">{settings.permissionReason || 'Bạn chưa có quyền điều khiển phòng này.'} Giáo viên cần ca đã duyệt đang diễn ra; admin được quản lý phòng đang hoạt động.</p>}
      <form className="automation-settings" onSubmit={e => { e.preventDefault(); save(enabled) }}>
        <h2>Ngưỡng điều khiển</h2><p>Quạt và đèn dùng hai ngưỡng riêng để hạn chế bật/tắt liên tục. Giữa hai ngưỡng, thiết bị giữ nguyên trạng thái.</p>
        <div className="automation-fields">{fields.map(([key, label, min, max, step]) => <label key={key}><span>{label}</span><input type="number" required min={min} max={max} step={step} value={draft?.[key] ?? ''} disabled={saving || !settings?.canConfigure} onChange={e => { dirty.current = true; setDraft(current => ({ ...current, [key]: e.target.value })); setError('') }} /></label>)}</div>
        <button type="submit" className="primary-button" disabled={unavailable}>Lưu ngưỡng điều khiển</button>
      </form>
      <section className="automation-details" aria-label="Nguyên tắc vận hành">
        <div className="automation-detail"><Lightbulb size={23} aria-hidden="true" /><div><h3>Có chuyển động: điều khiển theo ngưỡng</h3><p>Quạt theo nhiệt độ, đèn theo ánh sáng. Mỗi thiết bị cách nhau ít nhất 60 giây giữa hai lần đổi trạng thái.</p></div></div>
        <div className="automation-detail"><Timer size={23} aria-hidden="true" /><div><h3>Không có chuyển động: chờ trước khi tắt</h3><p>Chỉ tắt cả hai thiết bị khi chuỗi mẫu PIR liên tục không có chuyển động đủ thời gian đã cấu hình. PIR không đo số người; người ngồi yên có thể không được phát hiện.</p></div></div>
      </section>
      <p className="automation-footnote">Tắt tự động trước khi điều khiển thủ công. Khi giáo viên hết ca, hệ thống dừng tự động và giữ nguyên trạng thái thiết bị. <Link to="/iot/rooms/101">Mở thiết bị phòng 101</Link></p>
    </>}
  </div>
}
