import { test, expect } from '@playwright/test'

const origin = `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`
async function setup(page, role = 'ADMIN') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'overview_fixture', userId: 1, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only`
  await page.addInitScript(token => sessionStorage.setItem('smartclass.accessToken', token), token)
  const state = { fail: false, calls: [], workspace: { bookings: [], incidents: [] }, rooms: [
    { id: 101, name: 'Phòng 101', floor_number: 1, capacity: 40, usage_status: 'IN_USE', sensor_status: 'NO_DATA', open_incidents: 2, active_alerts: 1, current_booking: { title: 'Lập trình', ends_at: '2026-11-08T20:00:00' } },
    { id: 102, name: 'Phòng 102', floor_number: 1, capacity: 40, usage_status: 'AVAILABLE', sensor_status: 'NOT_CONNECTED', open_incidents: 0, active_alerts: 0 },
    { id: 201, name: 'Phòng 201', floor_number: 2, capacity: 60, usage_status: 'MAINTENANCE', sensor_status: 'ONLINE', open_incidents: 1, active_alerts: 0 },
  ] }
  await page.route('http://localhost:8080/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    state.calls.push({ path, method: route.request().method(), body: route.request().postDataJSON() })
    const reply = (data, status = 200) => route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, contentType: 'application/json', body: JSON.stringify({ success: status === 200, data }) })
    if (route.request().method() === 'OPTIONS') return reply(null)
    if (path === '/api/auth/me') return reply({ id: 1, username: 'overview_fixture', role })
    if (path === '/api/classroom/workspace') return reply(state.workspace)
    if (/^\/api\/classroom\/bookings\/\d+$/.test(path) && route.request().method() === 'PATCH') { state.workspace.bookings = []; return reply({}) }
    if (path === '/api/building/overview') return reply({ building: 'Nhà A', asOf: '2026-11-08T19:00:00', rooms: state.rooms, summary: { total: state.rooms.length, inUse: 1, available: 1, unavailable: 1, pending: 4 } }, state.fail ? 503 : 200)
    return reply(null, 404)
  })
  return state
}

test('overview aggregates the whole building and opens the selected room without reading default device state', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Tổng số phòng', exact: true })).toContainText('3')
  await expect(page.getByRole('region', { name: 'Tình hình vận hành' })).toContainText('Tình trạng sự cố toàn dãy')
  await expect(page.locator('.overview-room')).toHaveCount(3)
  await expect(page.getByRole('article', { name: 'Phòng 201', exact: true })).toContainText('Có dữ liệu mới')
  expect(state.calls.filter(call => /state|control|telemetry/.test(call.path))).toEqual([])
  await page.getByRole('link', { name: 'Thiết bị phòng 102', exact: true }).click()
  await expect(page).toHaveURL(/\/iot\/rooms\/102$/)
  expect(state.calls.some(call => call.path === '/api/iot/rooms/101')).toBe(false)
})

test('admin approves from the work queue only after confirmation', async ({ page }) => {
  const state = await setup(page)
  state.workspace.bookings = [{ id: 9, room_id: 102, room_status: 'ACTIVE', title: 'Ca cần duyệt', owner_name: 'teacher', status: 'PENDING', starts_at: '2026-11-10T08:00:00', ends_at: '2026-11-10T09:00:00', expires_at: '2026-11-09T08:00:00' }]
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click()
  expect(state.calls.some(call => call.method === 'PATCH')).toBe(false)
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(page.getByText('Không có lịch đang chờ duyệt.')).toBeVisible()
  expect(state.calls.find(call => call.method === 'PATCH').body).toEqual({ status: 'APPROVED', note: '' })
})

test('student sees personal incident tracking and teacher sees personal schedule', async ({ page }) => {
  const state = await setup(page, 'STUDENT')
  state.workspace.incidents = [{ id: 4, room_id: 102, title: 'Đèn hỏng', status: 'OPEN' }]
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Sự cố bạn đã báo', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Phòng 102 · Đèn hỏng/ })).toHaveAttribute('href', '/classroom?roomId=102&tab=incidents')
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/overview-student-desktop.png', fullPage: true })
})

test('teacher opens the current lesson from a mobile personal schedule', async ({ page }) => {
  const state = await setup(page, 'TEACHER')
  state.workspace.bookings = [{ id: 10, room_id: 101, room_status: 'ACTIVE', title: 'Ca đang dạy', status: 'APPROVED', starts_at: new Date(Date.now()-60000).toISOString(), ends_at: new Date(Date.now()+3600000).toISOString() }]
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Lịch của tôi', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mở thiết bị trong ca', exact: true })).toHaveAttribute('href', '/iot/rooms/101')
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/overview-teacher-mobile.png', fullPage: true })
})

test('overview keeps stale data explicit, supports retry, empty rooms and mobile layout', async ({ page }) => {
  const state = await setup(page, 'STUDENT')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await expect(page.locator('.overview-room')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true })
  state.fail = true
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('dữ liệu cũ')
  await expect(page.locator('.overview-room')).toHaveCount(3)
  state.fail = false; state.rooms = []
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.getByText('Chưa có phòng trong dãy nhà.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(state.calls.some(call => call.method === 'POST')).toBe(false)
})
