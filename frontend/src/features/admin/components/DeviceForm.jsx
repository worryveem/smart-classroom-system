import { useEffect, useState } from 'react'
import { api } from '../../../services/api/client.js'
import { statusLabels, statuses, types } from '../services/adminService.js'
import { FormActions, FormField } from './AdminFormFields.jsx'

export default function DeviceForm({ initial, busy, onSave, onClose }) {
  const [rooms, setRooms] = useState([])
  useEffect(() => {
    const controller = new AbortController()
    api.get('/api/building/rooms', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted && Array.isArray(data.data)) setRooms(data.data) }).catch(() => {})
    return () => controller.abort()
  }, [])
  const [values, setValues] = useState({ deviceId: initial?.device_id || '', roomId: initial ? String(initial.room_id) : '', type: initial?.type || 'SENSOR', macAddress: initial?.mac_address || '', status: initial?.status || 'ACTIVE' })
  const [errors, setErrors] = useState({})
  const change = (name, value) => { setValues(previous => ({ ...previous, [name]: value })); setErrors(previous => ({ ...previous, [name]: '' })) }
  function submit(event) {
    event.preventDefault()
    if (busy) return
    const next = {}, room = Number(values.roomId)
    if (!initial && !/^[A-Za-z0-9_-]{1,50}$/.test(values.deviceId)) next.deviceId = 'Device ID từ 1–50 ký tự chữ Latin, số, _ hoặc -.'
    if (!Number.isInteger(room) || room < 1 || room > 2147483647) next.roomId = 'Room ID là số nguyên dương, tối đa 2147483647.'
    if (!types.includes(values.type)) next.type = 'Chọn type hợp lệ.'
    if (!statuses.includes(values.status)) next.status = 'Chọn status hợp lệ.'
    if (values.macAddress && !/^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(values.macAddress)) next.macAddress = 'MAC có dạng AA:BB:CC:DD:EE:FF hoặc để trống.'
    setErrors(next)
    if (Object.keys(next).length) return
    const body = { roomId: room, type: values.type, macAddress: values.macAddress || null, status: values.status }
    if (!initial) body.deviceId = values.deviceId
    onSave(body)
  }
  return <form onSubmit={submit} noValidate className="admin-form">
    <FormField label="Device ID" name="deviceId" value={values.deviceId} onChange={change} error={errors.deviceId} disabled={busy || Boolean(initial)} maxLength={50} data-autofocus={!initial || undefined} />
    {initial && <p className="admin-form-note">Device ID là định danh cố định và không thể thay đổi.</p>}
    <label className="admin-room-choice">Chọn nhanh phòng học<select aria-label="Chọn nhanh phòng học" disabled={busy} value={rooms.some(r => String(r.id) === values.roomId) ? values.roomId : ''} onChange={e => change('roomId', e.target.value)}><option value="">Chọn tầng và phòng…</option>{rooms.map(room => <option key={room.id} value={room.id}>Tầng {room.floor_number} · Phòng {room.id} · {room.name}</option>)}</select></label>
    <FormField label="Room ID" name="roomId" type="number" min={1} max={2147483647} step={1} value={values.roomId} onChange={change} error={errors.roomId} disabled={busy} data-autofocus={Boolean(initial) || undefined} />
    <p className="admin-form-note">Đăng ký thiết bị chưa tự tạo kết nối IoT. Thiết bị đang cấu hình hoặc gắn với ca đã duyệt được bảo vệ khi chuyển phòng/xóa. Trạng thái Active không đồng nghĩa đang trực tuyến.</p>
    <div className="admin-form-columns"><FormField label="Type" name="type" value={values.type} onChange={change} error={errors.type} disabled={busy} options={types.map(type => ({ value: type, label: type }))} />
      <FormField label="Status" name="status" value={values.status} onChange={change} error={errors.status} disabled={busy} options={statuses.map(status => ({ value: status, label: statusLabels[status] }))} /></div>
    <FormField label="MAC Address (không bắt buộc)" name="macAddress" value={values.macAddress} onChange={change} error={errors.macAddress} disabled={busy} placeholder="AA:BB:CC:DD:EE:FF" maxLength={17} />
    <p className="admin-form-note">Để trống MAC nếu chưa có. Khi chỉnh sửa, để trống sẽ xóa địa chỉ MAC hiện tại.</p>
    <FormActions busy={busy} onClose={onClose} create={!initial} />
  </form>
}
