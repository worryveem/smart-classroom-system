import { useEffect, useState } from 'react'
import { api } from '../../services/api/client.js'
import Modal from '../../components/common/Modal.jsx'

export default function BookingEditModal({ booking, busy, error, onClose, onSave }) {
  const [rooms, setRooms] = useState([])
  useEffect(() => {
    const controller = new AbortController()
    api.get('/api/building/rooms', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted && Array.isArray(data.data)) setRooms(data.data) }).catch(() => {})
    return () => controller.abort()
  }, [])
  return <Modal title="Sửa đăng ký đang chờ" subtitle="Giữ nguyên hạn duyệt; lịch và sức chứa được kiểm tra lại khi lưu." busy={busy} onClose={onClose}><form className="classroom-dialog classroom-edit" onSubmit={async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget)
    const body = { title: String(form.get('title')), roomId: Number(form.get('roomId')), expectedAttendees: Number(form.get('expectedAttendees')), startsAt: `${form.get('startsAt')}:00`, endsAt: `${form.get('endsAt')}:00` }
    if (await onSave(body)) onClose()
  }}><label className="classroom-field"><span>Nội dung đăng ký</span><input name="title" defaultValue={booking.title} maxLength={150} required data-autofocus /></label><label className="classroom-field"><span>Phòng học</span><select name="roomId" defaultValue={booking.room_id || 101}><option value={booking.room_id || 101}>Phòng {booking.room_id || 101} · hiện tại</option>{rooms.filter(room => room.id !== (booking.room_id || 101) && room.status === 'ACTIVE').map(room => <option key={room.id} value={room.id}>Tầng {room.floor_number} · Phòng {room.id} · {room.capacity} chỗ</option>)}</select></label><label className="classroom-field"><span>Sĩ số dự kiến</span><input name="expectedAttendees" type="number" min={1} max={1000} defaultValue={booking.expected_attendees || 1} required /></label><label className="classroom-field"><span>Bắt đầu (UTC+07)</span><input name="startsAt" type="datetime-local" defaultValue={booking.starts_at.slice(0,16)} required /></label><label className="classroom-field"><span>Kết thúc (UTC+07)</span><input name="endsAt" type="datetime-local" defaultValue={booking.ends_at.slice(0,16)} required /></label>{error && <p role="alert">{error}</p>}<button disabled={busy}>Lưu đăng ký</button></form></Modal>
}
