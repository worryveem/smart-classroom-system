import { AlertTriangle } from 'lucide-react'
import Modal from '../../../components/common/Modal.jsx'
import { services } from '../services/adminService.js'
import { useAdminMutation } from '../hooks/useAdminMutation.js'

export default function DeleteConfirmModal({ dialog, onClose, onComplete }) {
  const mutation = useAdminMutation(dialog.scope, 'delete', onComplete)
  return <Modal title={`Xóa ${dialog.scope === 'users' ? 'tài khoản' : 'thiết bị'}?`} busy={mutation.busy} onClose={onClose}>
    <div className="delete-description"><AlertTriangle size={30} /><p>Bạn muốn xóa <strong>{dialog.label}</strong>?</p><span>{dialog.scope === 'devices' ? 'Thiết bị có dữ liệu lịch sử tham chiếu sẽ không được xóa. Lịch sử luôn được giữ nguyên.' : 'Thao tác này xóa tài khoản khỏi hệ thống. Không thể xóa tài khoản đang đăng nhập hoặc ADMIN cuối cùng.'}</span></div>
    {mutation.error && <p role="alert" className="admin-error">{mutation.error}</p>}
    <footer className="modal-actions"><button type="button" data-autofocus className="secondary-button" disabled={mutation.busy} onClick={onClose}>Hủy</button><button type="button" className="danger-button" disabled={mutation.busy} onClick={() => mutation.run(() => services[dialog.scope].remove(dialog.id))}>{mutation.busy ? 'Đang xóa…' : 'Xác nhận xóa'}</button></footer>
  </Modal>
}
