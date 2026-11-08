import { useEffect, useState } from 'react'
import axios from 'axios'
import { LoaderCircle } from 'lucide-react'
import Modal from '../../../components/common/Modal.jsx'
import UserForm from './UserForm.jsx'
import DeviceForm from './DeviceForm.jsx'
import { adminError, services } from '../services/adminService.js'
import { useAdminMutation } from '../hooks/useAdminMutation.js'

export default function AdminFormModal({ dialog, currentUser, onClose, onComplete }) {
  const { scope, id } = dialog, editing = dialog.mode === 'edit'
  const [detail, setDetail] = useState({ loading: editing, data: null, error: '' })
  const [retry, setRetry] = useState(0)
  const mutation = useAdminMutation(scope, editing ? 'update' : 'create', onComplete)
  useEffect(() => {
    if (!editing) return
    let disposed = false
    const controller = new AbortController()
    setDetail({ loading: true, data: null, error: '' })
    services[scope].get(id, controller.signal).then(data => { if (!disposed) setDetail({ loading: false, data, error: '' }) })
      .catch(error => { if (!disposed && !axios.isCancel(error)) setDetail({ loading: false, data: null, error: adminError(error, scope, 'detail') }) })
    return () => { disposed = true; controller.abort() }
  }, [scope, id, editing, retry])
  const Form = scope === 'users' ? UserForm : DeviceForm
  return <Modal title={`${editing ? 'Sửa' : 'Thêm'} ${scope === 'users' ? 'tài khoản' : 'thiết bị'}`} subtitle={editing ? `Đang chỉnh sửa ${dialog.label}` : 'Nhập thông tin để tạo bản ghi mới.'} busy={mutation.busy} onClose={onClose}>
    {mutation.error && <p role="alert" className="admin-error">{mutation.error}</p>}
    {detail.loading ? <div role="status" className="admin-detail-loading"><LoaderCircle className="spin" size={25} /><p>Đang tải thông tin mới nhất…</p></div>
      : detail.error ? <div className="admin-detail-error"><p role="alert">{detail.error}</p><button className="secondary-button" onClick={() => setRetry(value => value + 1)}>Tải lại chi tiết</button></div>
        : <Form initial={detail.data} currentUser={currentUser} busy={mutation.busy} onClose={onClose} onSave={body => mutation.run(() => editing ? services[scope].update(id, body) : services[scope].create(body))} />}
  </Modal>
}
