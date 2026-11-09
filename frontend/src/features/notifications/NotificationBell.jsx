import { useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { api } from '../../services/api/client.js'
import { usePollingResource } from '../dashboard/hooks/usePollingResource.js'
import './notifications.css'

export default function NotificationBell() {
  const fetcher = useCallback(async signal => {
    const { data } = await api.get('/api/notifications/unread-count', { signal })
    if (!data?.success || !Number.isInteger(data.data?.count) || data.data.count < 0) throw new Error('Invalid notification count')
    return data.data.count
  }, [])
  const resource = usePollingResource(fetcher, 30000)
  useEffect(() => {
    const refresh = () => resource.refresh()
    window.addEventListener('smartclass:notifications-changed', refresh)
    return () => window.removeEventListener('smartclass:notifications-changed', refresh)
  }, [resource.refresh])
  const count = resource.data
  return <Link className="notification-link" to="/notifications" aria-label={count > 0 ? `Thông báo, ${count} chưa đọc` : 'Thông báo'} title={resource.error ? 'Chưa cập nhật được số thông báo. Mở để thử lại.' : 'Thông báo của bạn'}><Bell size={20} aria-hidden="true" />{count > 0 && <span className="notification-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}</Link>
}
