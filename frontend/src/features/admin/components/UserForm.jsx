import { useState } from 'react'
import { roles } from '../services/adminService.js'
import { FormActions, FormField } from './AdminFormFields.jsx'

export default function UserForm({ initial, busy, onSave, onClose, currentUser }) {
  const [values, setValues] = useState({ username: initial?.username || '', role: initial?.role || 'STUDENT', password: '' })
  const [errors, setErrors] = useState({})
  const change = (name, value) => { setValues(previous => ({ ...previous, [name]: value })); setErrors(previous => ({ ...previous, [name]: '' })) }
  function submit(event) {
    event.preventDefault()
    if (busy) return
    const next = {}, password = values.password
    if (!values.username || values.username.length > 50 || /\s/.test(values.username)) next.username = 'Username bắt buộc, tối đa 50 ký tự và không có khoảng trắng.'
    if (!roles.includes(values.role)) next.role = 'Chọn vai trò hợp lệ.'
    const changingPassword = !initial || password.length > 0
    if (changingPassword && (!password.trim() || password.length < 8 || password.length > 72 || new TextEncoder().encode(password).length > 72)) next.password = 'Mật khẩu từ 8–72 ký tự và tối đa 72 byte UTF-8, không chỉ có khoảng trắng.'
    setErrors(next)
    if (Object.keys(next).length) return
    const body = { username: values.username, role: values.role }
    if (changingPassword) body.password = password
    onSave(body)
  }
  return <form onSubmit={submit} noValidate className="admin-form">
    <FormField label="Username" name="username" value={values.username} onChange={change} error={errors.username} maxLength={50} autoComplete="off" disabled={busy} data-autofocus />
    <FormField label="Role" name="role" value={values.role} onChange={change} error={errors.role} disabled={busy} options={roles.map(role => ({ value: role, label: role }))} />
    <FormField label={initial ? 'Mật khẩu mới (không bắt buộc)' : 'Mật khẩu'} name="password" type="password" value={values.password} onChange={change} error={errors.password} autoComplete="new-password" disabled={busy} maxLength={72} />
    <p className="admin-form-note">{initial ? 'Để trống để giữ mật khẩu hiện tại. ' : ''}Mật khẩu mới từ 8 ký tự, tối đa 72 byte UTF-8.</p>
    {initial?.id === currentUser.id && <p className="admin-form-notice">Bạn đang sửa tài khoản của mình. Đổi username sẽ cần đăng nhập lại; đổi role có thể làm mất quyền quản trị.</p>}
    <FormActions busy={busy} onClose={onClose} create={!initial} />
  </form>
}
