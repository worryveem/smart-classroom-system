import { RotateCcw, SlidersHorizontal } from 'lucide-react'

function Field({ name, label, error, children }) {
  return <div className={`history-field field-${name}`}><label htmlFor={`history-${name}`}>{label}</label>{children}{error && <p id={`history-${name}-error`} className="field-error" role="alert">{error}</p>}</div>
}
export default function HistoryFilters({ tab, filters, errors, change, reset }) {
  const input = (name, options = {}) => <input id={`history-${name}`} value={filters[name]} onChange={event => change(name, event.target.value)}
    aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `history-${name}-error` : undefined} {...options} />
  return (
    <section className="history-filters" aria-label="Bộ lọc lịch sử">
      <div className="history-filter-heading"><span><SlidersHorizontal size={15} />Bộ lọc dữ liệu</span><button type="button" onClick={reset}><RotateCcw size={13} />Đặt lại bộ lọc</button></div>
      <div className={`history-filter-grid ${tab === 'commands' ? 'command-filters' : ''}`}>
        <Field name="deviceId" label="Thiết bị" error={errors.deviceId}>{input('deviceId', { placeholder: 'Tất cả thiết bị', maxLength: 50, autoComplete: 'off', type: 'text' })}</Field>
        {tab === 'commands' && <>
          <Field name="target" label="Đối tượng"><select id="history-target" value={filters.target} onChange={event => change('target', event.target.value)}><option value="">Tất cả đối tượng</option><option value="FAN">FAN</option><option value="LIGHT">LIGHT</option></select></Field>
          <Field name="triggerBy" label="Người thực hiện" error={errors.triggerBy}>{input('triggerBy', { placeholder: 'Username hoặc RULE_ENGINE', maxLength: 50, list: 'history-actors', autoComplete: 'off' })}<datalist id="history-actors"><option value="RULE_ENGINE" /></datalist></Field>
        </>}
        <Field name="from" label="Từ thời điểm" error={errors.from}>{input('from', { type: 'datetime-local', step: 1 })}</Field>
        <Field name="to" label="Đến thời điểm" error={errors.to}>{input('to', { type: 'datetime-local', step: 1 })}</Field>
        <Field name={tab === 'telemetry' ? 'limit' : 'size'} label={tab === 'telemetry' ? 'Số bản ghi mới nhất' : 'Số bản ghi / trang'} error={errors.limit || errors.size}>
          {tab === 'telemetry' ? input('limit', { type: 'number', min: 1, max: 1000, step: 1 })
            : <select id="history-size" value={filters.size} onChange={event => change('size', event.target.value)}>{[10, 20, 50, 100].map(size => <option key={size} value={size}>{size} bản ghi</option>)}</select>}
        </Field>
      </div>
      <p className="history-filter-note">Thời gian theo Việt Nam (UTC+07). Bộ lọc tự áp dụng sau khi ngừng nhập; để trống để xem tất cả.</p>
    </section>
  )
}
