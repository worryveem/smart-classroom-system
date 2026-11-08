import { Inbox, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { formatTime } from '../../../utils/dateTime.js'
import { statusLabels } from '../services/adminContracts.js'

function Actions({ row, scope, currentUser, disabled, open }) {
  const label = scope === 'users' ? row.username : row.device_id
  const id = scope === 'users' ? row.id : row.device_id
  const self = scope === 'users' && row.id === currentUser.id
  return <div className="admin-row-actions"><button aria-label={`Sửa ${label}`} title="Sửa" disabled={disabled} onClick={() => open({ kind: 'form', mode: 'edit', scope, id, label })}><Pencil size={14} /></button><button aria-label={`Xóa ${label}`} title={self ? 'Không thể tự xóa tài khoản đang đăng nhập' : 'Xóa'} disabled={disabled || self} onClick={() => open({ kind: 'delete', scope, id, label })}><Trash2 size={14} /></button></div>
}
export default function ManagementTable({ scope, rows, loading, invalid, error, currentUser, open, disabled }) {
  const users = scope === 'users'
  return <div className="admin-table-scroll" role="region" aria-label={users ? 'Bảng người dùng' : 'Bảng thiết bị'} tabIndex={0} aria-busy={loading}>
    <table className={`admin-table ${users ? 'users-table' : 'devices-table'}`}><caption className="sr-only">{users ? 'Danh sách tài khoản' : 'Danh sách thiết bị'}</caption>
      <thead><tr>{(users ? ['ID', 'Username', 'Role', 'Ngày tạo', 'Thao tác'] : ['Device ID', 'Room ID', 'Type', 'MAC Address', 'Status', 'Ngày tạo', 'Thao tác']).map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={users ? row.id : row.device_id}>
        {users ? <><td className="admin-muted">#{row.id}</td><td><strong className="admin-username">{row.username}</strong>{row.id === currentUser.id && <span className="self-label">Bạn</span>}</td><td><span className={`admin-badge role-${row.role.toLowerCase()}`}>{row.role}</span></td></>
          : <><td><code>{row.device_id}</code></td><td>{row.room_id}</td><td><span className={`admin-badge type-${row.type.toLowerCase()}`}>{row.type}</span></td><td className="admin-mac">{row.mac_address || '—'}</td><td><span className={`admin-badge status-${row.status.toLowerCase()}`}>{statusLabels[row.status]}</span></td></>}
        <td className="admin-date">{formatTime(row.created_at, true)}</td><td><Actions row={row} scope={scope} currentUser={currentUser} disabled={disabled} open={open} /></td>
      </tr>) : <tr><td colSpan={users ? 5 : 7}><div className="admin-table-state">{loading ? <LoaderCircle className="spin" size={27} /> : <Inbox size={30} />}<h3>{loading ? 'Đang tải dữ liệu…' : invalid ? 'Vui lòng kiểm tra bộ lọc' : error ? 'Chưa tải được danh sách' : 'Không có bản ghi phù hợp'}</h3><p>{loading ? 'Đang truy vấn từ hệ thống.' : 'Thay đổi bộ lọc hoặc dùng nút làm mới để thử lại.'}</p></div></td></tr>}</tbody>
    </table>
  </div>
}
