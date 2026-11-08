import { useId } from 'react'

export function FormField({ label, name, value, onChange, error, options, ...props }) {
  const id = useId()
  const shared = { id, name, value, onChange: event => onChange(name, event.target.value), 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined, ...props }
  return <div className="admin-form-field"><label htmlFor={id}>{label}</label>{options ? <select {...shared}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input {...shared} />}{error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}</div>
}
export function FormActions({ busy, onClose, create }) {
  return <footer className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Hủy</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Đang lưu…' : create ? 'Tạo mới' : 'Lưu thay đổi'}</button></footer>
}
