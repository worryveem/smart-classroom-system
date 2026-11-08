import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Cpu, Plus, RefreshCw, Users } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { useQueryResource } from '../../../hooks/useQueryResource.js'
import Pagination from '../../../components/common/Pagination.jsx'
import { formatTime } from '../../../utils/dateTime.js'
import { adminError, fetchAdminList, statusLabels, statuses, types } from '../services/adminService.js'
import ManagementTable from '../components/ManagementTable.jsx'
import AdminFormModal from '../components/AdminFormModal.jsx'
import DeleteConfirmModal from '../components/DeleteConfirmModal.jsx'
import '../admin.css'

const defaults = { users: { username: '', page: 0, size: '20' }, devices: { roomId: '', type: '', status: '', page: 0, size: '20' } }

export default function AdminPage() {
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => searchParams.get('tab') === 'devices' ? 'devices' : 'users'), [filters, setFilters] = useState(() => ({ users: { ...defaults.users }, devices: { ...defaults.devices, roomId: /^[1-9]\d{0,8}$/.test(searchParams.get('roomId') || '') ? searchParams.get('roomId') : '' } }))
  const [revisions, setRevisions] = useState({ users: 0, devices: 0 }), [dialog, setDialog] = useState(null), [notice, setNotice] = useState('')
  const refs = useRef([])
  const current = filters[tab], users = tab === 'users'
  const room = Number(current.roomId)
  const valid = users || !current.roomId || (Number.isInteger(room) && room > 0 && room <= 2147483647)
  const params = { page: current.page, size: Number(current.size) }
  if (users && current.username.trim()) params.username = current.username.trim()
  if (!users) { if (current.roomId) params.roomId = room; if (current.type) params.type = current.type; if (current.status) params.status = current.status }
  const list = useQueryResource(tab, params, valid, revisions[tab], fetchAdminList)
  const denied = list.error?.response?.status === 403
  const refresh = () => setRevisions(previous => ({ ...previous, [tab]: previous[tab] + 1 }))
  const change = (name, value) => setFilters(previous => ({ ...previous, [tab]: { ...previous[tab], [name]: value, page: 0 } }))
  useEffect(() => {
    if (list.data && !list.loading && current.page > 0 && current.page >= list.data.totalPages) {
      setFilters(previous => ({ ...previous, [tab]: { ...previous[tab], page: Math.max(0, list.data.totalPages - 1) } }))
    }
  }, [list.data, list.loading, current.page, tab])
  function complete(data) {
    const completed = dialog
    setDialog(null)
    setNotice(completed.kind === 'delete' ? 'Đã xóa bản ghi. Danh sách được tải lại.' : 'Đã lưu thành công. Danh sách được tải lại theo bộ lọc hiện tại.')
    setRevisions(previous => ({ ...previous, [completed.scope]: previous[completed.scope] + 1 }))
    if (completed.kind === 'delete' && list.data?.rows.length === 1 && current.page > 0) setFilters(previous => ({ ...previous, [tab]: { ...previous[tab], page: current.page - 1 } }))
    if (completed.scope === 'users' && data?.id === auth.user.id && (data.username !== auth.user.username || data.role !== auth.user.role)) auth.retry()
  }
  function tabKey(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index
    setTab(next ? 'devices' : 'users'); refs.current[next]?.focus()
  }
  return <div className="admin-page">
    <header className="admin-heading"><div><h1>Quản trị</h1><p>Quản lý tài khoản và thiết bị của hệ thống SmartClass.</p></div><div className="admin-toolbar"><button className="secondary-button" disabled={list.loading || !valid} onClick={refresh}><RefreshCw size={15} className={list.loading ? 'spin' : ''} />Làm mới</button><button className="primary-button" disabled={denied} onClick={() => setDialog({ kind: 'form', mode: 'create', scope: tab })}><Plus size={16} />{users ? 'Thêm tài khoản' : 'Thêm thiết bị'}</button></div></header>
    <div className="admin-tabs" role="tablist" aria-label="Quản lý hệ thống">{[{ key: 'users', label: 'Người dùng', icon: Users }, { key: 'devices', label: 'Thiết bị', icon: Cpu }].map(({ key, label, icon: Icon }, index) => <button key={key} ref={node => { refs.current[index] = node }} role="tab" id={`admin-tab-${key}`} aria-controls={`admin-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onKeyDown={event => tabKey(event, index)} onClick={() => setTab(key)}><Icon size={17} />{label}</button>)}</div>
    {notice && <p className="admin-notice" role="status"><CheckCircle2 size={16} />{notice}</p>}
    <section role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`}>
      <div className="admin-filters"><div className="admin-filter-grid">
        {users ? <label>Tìm username<input value={current.username} maxLength={50} placeholder="Nhập tên người dùng…" onChange={event => change('username', event.target.value)} /></label> : <>
          <label>Lọc Room ID<input type="number" min={1} max={2147483647} value={current.roomId} placeholder="Tất cả phòng" aria-invalid={!valid} onChange={event => change('roomId', event.target.value)} />{!valid && <span role="alert" className="field-error">Room ID phải là số nguyên dương.</span>}</label>
          <label>Lọc Type<select value={current.type} onChange={event => change('type', event.target.value)}><option value="">Tất cả loại thiết bị</option>{types.map(type => <option key={type}>{type}</option>)}</select></label>
          <label>Lọc Status<select value={current.status} onChange={event => change('status', event.target.value)}><option value="">Tất cả trạng thái</option>{statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        </>}
        <label>Bản ghi / trang<select value={current.size} onChange={event => change('size', event.target.value)}>{[10, 20, 50, 100].map(size => <option key={size} value={size}>{size} bản ghi</option>)}</select></label>
      </div><button className="admin-reset" onClick={() => setFilters(previous => ({ ...previous, [tab]: { ...defaults[tab] } }))}>Đặt lại bộ lọc</button></div>
      {list.error && <div role="alert" className="admin-list-error"><AlertCircle size={18} /><div><p>{adminError(list.error, tab, 'list')}{list.data && ' Đang hiển thị dữ liệu lần tải trước.'}</p>{denied && <button className="text-button" onClick={auth.retry}>Kiểm tra lại quyền</button>}</div></div>}
      <section className="admin-results"><header><h2>{users ? 'Danh sách tài khoản' : 'Danh sách thiết bị'}</h2><span>{list.loading ? 'Đang tải…' : list.loadedAt ? `Lần tải: ${formatTime(list.loadedAt)}` : 'Chưa có dữ liệu'}</span></header>
        <ManagementTable scope={tab} rows={list.data?.rows ?? []} loading={list.loading} invalid={!valid} error={list.error} currentUser={auth.user} open={setDialog} disabled={list.loading || denied} />
        <Pagination data={list.data} loading={list.loading} label={users ? 'Phân trang người dùng' : 'Phân trang thiết bị'} setPage={page => setFilters(previous => ({ ...previous, [tab]: { ...previous[tab], page } }))} />
      </section>
      <p className="admin-bottom-note">Mọi thay đổi được lưu vào hệ thống. Ngày tạo hiển thị theo giờ Việt Nam (UTC+07).</p>
    </section>
    {dialog?.kind === 'form' && <AdminFormModal key={`${dialog.scope}-${dialog.mode}-${dialog.id || 'new'}`} dialog={dialog} currentUser={auth.user} onClose={() => setDialog(null)} onComplete={complete} />}
    {dialog?.kind === 'delete' && <DeleteConfirmModal dialog={dialog} onClose={() => setDialog(null)} onComplete={complete} />}
  </div>
}
