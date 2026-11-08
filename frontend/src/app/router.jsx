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

export const router = createBrowserRouter([
  { element: <GuestRoute />, children: [{ path: '/login', element: <LoginPage /> }] },
  {
    element: <ProtectedRoute />,
    children: [{ element: <AppLayout />, children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <Suspense fallback={<p role="status">Đang tải tổng quan…</p>}><OverviewPage /></Suspense> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/building', element: <Suspense fallback={<p role="status">Đang tải Nhà A…</p>}><BuildingPage /></Suspense> },
      { path: '/iot', element: <Suspense fallback={<p role="status">Đang tải danh sách IoT…</p>}><IotRoomsPage /></Suspense> },
      { path: '/iot/rooms/:roomId', element: <Suspense fallback={<p role="status">Đang tải IoT phòng…</p>}><IotRoomPage /></Suspense> },
      { path: '/classroom', element: <Suspense fallback={<p role="status">Đang tải phòng học…</p>}><ClassroomPage /></Suspense> },
      { element: <RoleRoute roles={['ADMIN']} />, children: [{ path: '/admin', element: <AdminPage /> }] },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ] }],
  },
])
