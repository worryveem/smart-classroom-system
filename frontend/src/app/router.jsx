import { createBrowserRouter, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import AppLayout from '../components/layout/AppLayout.jsx'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import HistoryPage from '../features/history/pages/HistoryPage.jsx'
import AdminPage from '../features/admin/pages/AdminPage.jsx'
import { GuestRoute, ProtectedRoute, RoleRoute } from '../components/common/ProtectedRoute.jsx'
const OverviewPage = lazy(() => import('../features/dashboard/pages/OverviewPage.jsx'))
const ClassroomPage = lazy(() => import('../features/classroom/ClassroomPage.jsx'))
const BuildingPage = lazy(() => import('../features/building/BuildingPage.jsx'))
const IotRoomsPage = lazy(() => import('../features/iot/IotRoomsPage.jsx'))
const IotRoomPage = lazy(() => import('../features/iot/IotRoomPage.jsx'))
const TeachingHistoryPage = lazy(() => import('../features/teaching/TeachingHistoryPage.jsx'))
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage.jsx'))
const AccountPage = lazy(() => import('../features/account/AccountPage.jsx'))
const AutomationPage = lazy(() => import('../features/automation/AutomationPage.jsx'))
const IncidentsPage = lazy(() => import('../features/incidents/IncidentsPage.jsx'))

export const router = createBrowserRouter([
  { element: <GuestRoute />, children: [{ path: '/login', element: <LoginPage /> }] },
  {
    element: <ProtectedRoute />,
    children: [{ element: <AppLayout />, children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/incidents', element: <Suspense fallback={<p role="status">Đang tải báo cáo sự cố…</p>}><IncidentsPage /></Suspense> },
      { element: <RoleRoute roles={['ADMIN', 'TEACHER']} />, children: [{ path: '/automation', element: <Suspense fallback={<p role="status">Đang tải chế độ tự động…</p>}><AutomationPage /></Suspense> }] },
      { path: '/dashboard', element: <Suspense fallback={<p role="status">Đang tải tổng quan…</p>}><OverviewPage /></Suspense> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/notifications', element: <Suspense fallback={<p role="status">Đang tải thông báo…</p>}><NotificationsPage /></Suspense> },
      { path: '/profile', element: <Suspense fallback={<p role="status">Đang tải tài khoản…</p>}><AccountPage /></Suspense> },
      { element: <RoleRoute roles={['TEACHER']} />, children: [{ path: '/my-schedule', element: <Suspense fallback={<p role="status">Đang tải lịch của tôi…</p>}><TeachingHistoryPage /></Suspense> }] },
      { path: '/building', element: <Suspense fallback={<p role="status">Đang tải Nhà A…</p>}><BuildingPage /></Suspense> },
      { path: '/iot', element: <Suspense fallback={<p role="status">Đang tải danh sách IoT…</p>}><IotRoomsPage /></Suspense> },
      { path: '/iot/rooms/:roomId', element: <Suspense fallback={<p role="status">Đang tải IoT phòng…</p>}><IotRoomPage /></Suspense> },
      { path: '/classroom', element: <Suspense fallback={<p role="status">Đang tải phòng học…</p>}><ClassroomPage /></Suspense> },
      { element: <RoleRoute roles={['ADMIN']} />, children: [{ path: '/admin', element: <AdminPage /> }] },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ] }],
  },
])
