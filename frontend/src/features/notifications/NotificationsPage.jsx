import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, RefreshCw } from 'lucide-react'
import { api } from '../../services/api/client.js'
import { formatTime } from '../../utils/dateTime.js'
import { usePollingResource } from '../dashboard/hooks/usePollingResource.js'
import './notifications.css'

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(0), [unreadOnly, setUnreadOnly] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const working = useRef(false)
  const fetcher = useCallback(async signal => {
    const { data } = await api.get('/api/notifications', { signal, params: { page, size: 20, unreadOnly } })
    if (!data?.success || !Array.isArray(data.data?.rows) || !Number.isInteger(data.data?.totalPages) || !Number.isInteger(data.data?.unreadCount) || !Number.isInteger(data.data?.latestId)) throw new Error('Invalid notifications')
    return data.data
  }, [page, unreadOnly])
  const resource = usePollingResource(fetcher, 30000), data = resource.data
  useEffect(() => { if (data && page > 0 && page >= data.totalPages) setPage(Math.max(0, data.totalPages-1)) }, [data, page])
  async function mark(id, target) {
    if (working.current) return
    working.current = true; setBusy(true); setError('')
    try {
      if (id === 'all') await api.post('/api/notifications/read-all', { upToId: data.latestId })
      else await api.patch(`/api/notifications/${id}/read`)
      window.dispatchEvent(new Event('smartclass:notifications-changed')); resource.refresh()
      if (target) navigate(target)
    } catch (e) { setError(e.response?.data?.message || 'Chưa lưu được trạng thái đã đọc. Vui lòng thử lại.') }
    finally { working.current = false; setBusy(false) }
  }
  return <div className="personal-page notifications-page">
    <header className="personal-heading"><div><p className="eyebrow">Cập nhật dành cho bạn</p><h1>Thông báo</h1><p>Kết quả đăng ký phòng, thay đổi lịch và tiến độ xử lý sự cố.</p></div><button className="secondary-button" onClick={resource.refresh} disabled={resource.refreshing}><RefreshCw size={16} />Làm mới thông báo</button></header>
    <div className="notification-toolbar"><label><input type="checkbox" checked={unreadOnly} onChange={e => { setUnreadOnly(e.target.checked); setPage(0) }} />Chỉ chưa đọc</label><span role="status">{data ? `${data.unreadCount} chưa đọc` : 'Đang tải…'}</span><button className="secondary-button" disabled={busy || !data?.unreadCount || Boolean(resource.error)} onClick={() => mark('all')}><CheckCheck size={16} />Đánh dấu tất cả đã đọc</button></div>
    {resource.error && <p className="personal-error" role="alert">Chưa tải được thông báo.{data ? ' Danh sách bên dưới là dữ liệu cũ.' : ' Nhấn Làm mới thông báo để thử lại.'}</p>}
    {error && <p className="personal-error" role="alert">{error}</p>}
    {resource.loading && <p role="status">Đang tải thông báo của bạn…</p>}
    {data && !data.rows.length && <div className="personal-empty"><Bell size={32} /><h2>{unreadOnly ? 'Bạn đã đọc hết thông báo' : 'Chưa có thông báo'}</h2><p>Thông báo mới sẽ xuất hiện khi có thay đổi liên quan đến bạn.</p></div>}
    <div className="notification-list">{data?.rows.map(row => {
      const target = typeof row.target_path === 'string' && /^\/(my-schedule|classroom|dashboard)([/?#]|$)/.test(row.target_path) ? row.target_path : '/dashboard'
      return <article key={row.id} className={`notification-card${row.read_at ? '' : ' is-unread'}`} aria-label={row.title}><div className="notification-card-top"><span>{row.read_at ? 'Đã đọc' : 'Chưa đọc'}</span><time>{formatTime(row.created_at, true)}</time></div><h2>{row.title}</h2><p>{row.message}</p><div className="notification-actions"><button className="text-button" disabled={busy} onClick={() => row.read_at ? navigate(target) : mark(row.id, target)}>Mở nội dung</button>{!row.read_at && <button className="text-button" disabled={busy} onClick={() => mark(row.id)}>Đánh dấu đã đọc</button>}</div></article>
    })}</div>
    {data && data.totalPages > 1 && <nav className="personal-pagination" aria-label="Phân trang thông báo"><button className="secondary-button" disabled={page === 0 || resource.refreshing} onClick={() => setPage(p => p-1)}>Trước</button><span>Trang {page+1}/{data.totalPages}</span><button className="secondary-button" disabled={page+1 >= data.totalPages || resource.refreshing} onClick={() => setPage(p => p+1)}>Sau</button></nav>}
    <p className="personal-footnote">Tự cập nhật mỗi 30 giây khi trang đang mở. Chỉ bạn có thể xem và đánh dấu thông báo của mình. Thông báo bắt đầu được lưu từ khi tính năng này được triển khai.</p>
  </div>
}
