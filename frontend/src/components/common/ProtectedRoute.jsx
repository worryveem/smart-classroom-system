import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import AuthStatus from './AuthStatus.jsx'
import { returnPath } from '../../features/auth/returnPath.js'

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'checking' || status === 'error') return <AuthStatus />
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />
  return <Outlet />
}

export function GuestRoute() {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'checking' || status === 'error') return <AuthStatus />
  if (status === 'authenticated') return <Navigate to={returnPath(location.state?.from, user.role)} replace />
  return <Outlet />
}

export function RoleRoute({ roles }) {
  const { user } = useAuth()
  if (user && roles.includes(user.role)) return <Outlet />
  return (
    <section className="permission-card">
      <ShieldCheck size={36} aria-hidden="true" />
      <p className="eyebrow">Quyền truy cập</p>
      <h1>Bạn không có quyền truy cập</h1>
      <p>Khu vực quản trị chỉ dành cho tài khoản ADMIN.</p>
      <Link to="/dashboard" className="primary-button">Về trang tổng quan</Link>
    </section>
  )
}
