import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import AppLayout from '../components/layout/AppLayout.jsx'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import HistoryPage from '../features/history/pages/HistoryPage.jsx'
import AdminPage from '../features/admin/pages/AdminPage.jsx'
import { GuestRoute, ProtectedRoute, RoleRoute } from '../components/common/ProtectedRoute.jsx'
const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage.jsx'))

export const router = createBrowserRouter([
  { element: <GuestRoute />, children: [{ path: '/login', element: <LoginPage /> }] },
  {
    element: <ProtectedRoute />,
    children: [{ element: <AppLayout />, children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <Suspense fallback={<p role="status">Đang tải tổng quan…</p>}><DashboardPage /></Suspense> },
      { path: '/history', element: <HistoryPage /> },
      { element: <RoleRoute roles={['ADMIN']} />, children: [{ path: '/admin', element: <AdminPage /> }] },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ] }],
  },
])
