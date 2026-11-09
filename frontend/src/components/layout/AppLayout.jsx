import { Link, NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, History, LayoutDashboard, LogOut, School, Settings, PanelsTopLeft, BrainCircuit, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import NotificationBell from '../../features/notifications/NotificationBell.jsx'
import '../../features/account/account.css'

const roleLabels = { ADMIN: 'Quản trị viên', TEACHER: 'Giáo viên', STUDENT: 'Học viên' }

export default function AppLayout() {
  const { user, logout } = useAuth()
  const links = [
    ...(['ADMIN', 'TEACHER'].includes(user.role) ? [{ to: '/automation', label: 'Chế độ tự động', icon: BrainCircuit }] : []),
    { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    ...(user.role === 'TEACHER' ? [{ to: '/my-schedule', label: 'Lịch của tôi', icon: CalendarDays }] : []),
    { to: '/building', label: 'Phòng học', icon: School },
    { to: '/iot', label: 'Thiết bị theo phòng', icon: PanelsTopLeft },
    { to: '/history', label: 'Lịch sử', icon: History },
    { to: '/incidents', label: 'Báo cáo sự cố', icon: AlertTriangle },
    ...(user.role === 'ADMIN' ? [{ to: '/admin', label: 'Quản trị', icon: Settings }] : []),
  ]
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <header className="app-header">
        <NavLink to="/dashboard" className="brand"><span className="brand-mark"><School size={23} /></span>SmartClass<span className="iot-tag">IoT</span></NavLink>
        <div className="header-context"><PanelsTopLeft size={18} aria-hidden="true" /><span>Quản lý phòng học</span></div>
        <div className="account-menu">
          <NotificationBell key={user.id} />
          <Link to="/profile" className="account-identity" aria-label="Tài khoản cá nhân" title="Thông tin cá nhân và đổi mật khẩu"><div className="account-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</div><div className="account-text"><strong>{user.username}</strong><span>{roleLabels[user.role]}</span></div></Link>
          <button onClick={logout} className="logout-button" aria-label="Đăng xuất"><LogOut size={18} aria-hidden="true" /><span>Đăng xuất</span></button>
        </div>
      </header>
      <div className="app-body">
        <nav aria-label="Điều hướng chính" className="app-nav">
          <p className="eyebrow">Không gian làm việc</p>
          {links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}><Icon size={19} aria-hidden="true" />{label}</NavLink>)}
          <div className="nav-caption"><School strokeWidth={1.1} aria-hidden="true" /><p>Mỗi lớp học,<br />một không gian kết nối.</p><span>SmartClass IoT</span></div>
        </nav>
        <main id="main-content" tabIndex={-1} className="app-content"><Outlet /></main>
      </div>
    </div>
  )
}
