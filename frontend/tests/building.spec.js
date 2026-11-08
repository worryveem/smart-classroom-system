import { test, expect } from '@playwright/test'

const headers = { 'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS' }
async function setup(page, role = 'ADMIN') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'building_fixture', userId: 1, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only`
  await page.addInitScript(token => sessionStorage.setItem('smartclass.accessToken', token), token)
  const rooms = [1, 2, 3].flatMap(floor => Array.from({ length: 5 }, (_, index) => {
    const id = floor * 100 + index + 1
    return { id, name: `Phòng ${id}`, floor_number: floor, capacity: id === 201 ? 60 : 40, equipment: id === 201 ? 'Máy chiếu' : '', status: id === 103 ? 'MAINTENANCE' : 'ACTIVE', maintenance_note: id === 103 ? 'Sửa cửa' : '',
      usage_status: id === 102 ? 'IN_USE' : id === 103 ? 'MAINTENANCE' : 'AVAILABLE', current_booking: id === 102 ? { title: 'Lập trình Java', owner_name: 'teacher', ends_at: '2026-11-08T20:00:00' } : null, next_booking: null,
      available_in_window: ![102, 103].includes(id), pending_bookings: 0, open_incidents: 0, active_alerts: 0, booking_rate: id === 102 ? 100 : 0, booked_minutes: id === 102 ? 60 : 0,
      sensor_status: id === 101 ? 'ONLINE' : 'NOT_CONNECTED', telemetry: id === 101 ? { temp: 29.5, humid: 65, lux: 300, occupancy: true, timestamp: '2026-11-08T19:00:00' } : null, occupancy_without_booking: id === 101 }
  }))
  const state = { rooms, calls: [], bookings: [], fail: false }
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method(), params = Object.fromEntries(url.searchParams)
    const reply = (data, status = 200, message = 'Thành công') => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message, data }) })
    if (method === 'OPTIONS') return reply(null)
    const body = request.postDataJSON(); state.calls.push({ path, method, params, body })
    if (path === '/api/auth/me') return reply({ id: 1, username: 'building_fixture', role })
    if (state.fail) return reply(null, 503, 'Không đọc được Nhà A')
    if (path === '/api/building/overview') return reply({ building: 'Nhà A', asOf: '2026-11-08T19:00:00', from: params.from || '2026-11-08T19:00:00', to: params.to || '2026-11-08T20:00:00', rooms: state.rooms.map(room => ({ ...room, available_in_window: params.from && room.id === 101 ? false : room.available_in_window })), summary: { total: state.rooms.length, inUse: state.rooms.filter(r => r.usage_status === 'IN_USE').length, available: state.rooms.filter(r => r.usage_status === 'AVAILABLE').length, unavailable: state.rooms.filter(r => r.status !== 'ACTIVE').length, pending: 0 } })
    if (path === '/api/building/rooms' && method === 'POST') {
      if (state.rooms.some(r => r.id === body.roomId)) return reply(null, 409, 'Số phòng đã tồn tại')
      state.rooms.push({ ...body, id: body.roomId, floor_number: body.floor, usage_status: 'AVAILABLE', sensor_status: 'NOT_CONNECTED', telemetry: null, available_in_window: true, pending_bookings: 0, open_incidents: 0, booked_minutes: 0, booking_rate: 0 }); return reply(state.rooms.at(-1))
    }
    if (/^\/api\/building\/rooms\/\d+$/.test(path) && method === 'PUT') {
      Object.assign(state.rooms.find(r => r.id === body.roomId), { name: body.name, capacity: body.capacity, status: body.status, usage_status: body.status === 'ACTIVE' ? 'AVAILABLE' : body.status, maintenance_note: body.note, available_in_window: body.status === 'ACTIVE' }); return reply(null)
    }
    if (path.endsWith('/events')) return reply([{ id: 1, actor: 'building_fixture', message: 'Đổi trạng thái bảo trì', created_at: '2026-11-08T19:00:00' }])
    if (path === '/api/classroom/settings') return reply({ name: 'Phòng 101' })
    if (path === '/api/classroom/permission') return reply({ allowed: params.roomId === '101', reason: 'Phòng chưa kết nối thiết bị IoT', bookingId: 0 })
    if (path === '/api/classroom/bookings' && method === 'POST') { state.bookings.push({ id: 9, ...body, room_id: body.roomId, expected_attendees: body.expectedAttendees, owner_id: 1, owner_name: 'building_fixture', starts_at: body.startsAt, ends_at: body.endsAt, status: 'PENDING' }); return reply(state.bookings.at(-1)) }
    if (path === '/api/classroom/bookings') return reply(state.bookings.filter(b => b.room_id === Number(params.roomId)))
    if (path === '/api/classroom/alerts') return reply([])
    return reply(null, 404)
  })
  await page.goto('/building')
  await expect(page.getByRole('article', { name: 'Phòng 101', exact: true })).toBeVisible()
  return state
}

test('building displays all 15 rooms and distinguishes schedule from real sensor occupancy', async ({ page }) => {
  await setup(page)
  await expect(page.locator('.building-room')).toHaveCount(15)
  const physical = page.getByRole('article', { name: 'Phòng 101', exact: true })
  await expect(physical).toContainText('29,5°C')
  await expect(physical).toContainText('Có tín hiệu người khi chưa có tiết theo lịch')
  const other = page.getByRole('article', { name: 'Phòng 102', exact: true })
  await expect(other).toContainText('Đang có tiết')
  await expect(other).toContainText('Lập trình Java')
  await expect(other).toContainText('Chưa kết nối IoT')
  await expect(other).not.toContainText('29,5')
  await expect(page.locator('.building-no-sensor')).toHaveCount(14)
})

test('floor, capacity and equipment filters find suitable rooms', async ({ page }) => {
  await setup(page)
  await page.getByLabel('Tầng', { exact: true }).selectOption('2')
  await expect(page.locator('.building-room')).toHaveCount(5)
  await page.getByLabel('Sức chứa tối thiểu').fill('50')
  await expect(page.locator('.building-room')).toHaveCount(1)
  await expect(page.getByRole('article', { name: 'Phòng 201', exact: true })).toBeVisible()
  await page.getByLabel('Tìm phòng / trang thiết bị').fill('Máy chiếu')
  await expect(page.locator('.building-room')).toHaveCount(1)
})

test('availability query uses explicit local times and excludes reserved or maintained rooms', async ({ page }) => {
  const state = await setup(page)
  await page.getByLabel('Từ (UTC+07)', { exact: true }).fill('2026-11-10T08:00')
  await page.getByLabel('Đến (UTC+07)', { exact: true }).fill('2026-11-10T10:00')
  await page.getByRole('button', { name: 'Tìm phòng trống', exact: true }).click()
  await expect(page.locator('.building-room')).toHaveCount(12)
  expect(state.calls.filter(c => c.path.endsWith('/overview')).at(-1).params).toEqual({ from: '2026-11-10T08:00:00', to: '2026-11-10T10:00:00' })
  await expect(page.getByRole('article', { name: 'Phòng 101', exact: true })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Phòng 103', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Xem hiện tại' }).click()
  await expect(page.locator('.building-room')).toHaveCount(15)
})

test('admin maintains a room with required reason and reads its audit history', async ({ page }) => {
  const state = await setup(page)
  await page.getByRole('article', { name: 'Phòng 101', exact: true }).getByRole('button', { name: 'Quản lý', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Trạng thái vận hành').selectOption('MAINTENANCE')
  await dialog.getByLabel('Lý do bảo trì / ghi chú').fill('Kiểm tra hệ thống điện')
  await dialog.getByRole('button', { name: 'Lưu phòng' }).click()
  await expect(page.getByRole('article', { name: 'Phòng 101', exact: true })).toContainText('Đang bảo trì')
  expect(state.calls.find(c => c.method === 'PUT').body).toMatchObject({ roomId: 101, status: 'MAINTENANCE', note: 'Kiểm tra hệ thống điện' })
  await page.getByRole('article', { name: 'Phòng 101', exact: true }).getByRole('button', { name: 'Quản lý', exact: true }).click()
  await page.getByRole('button', { name: 'Nhật ký thay đổi' }).click()
  await expect(page.getByRole('dialog', { name: 'Nhật ký phòng 101', exact: true })).toContainText('Đổi trạng thái bảo trì')
})

test('creating a duplicate room preserves form and students cannot manage rooms', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Thêm phòng', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Số phòng', { exact: true }).fill('101')
  await dialog.getByLabel('Tên phòng', { exact: true }).fill('Phòng trùng')
  await dialog.getByRole('button', { name: 'Lưu phòng' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Số phòng đã tồn tại')
  await expect(dialog.getByLabel('Tên phòng', { exact: true })).toHaveValue('Phòng trùng')
})

test('non-IoT room keeps bookings scoped and never exposes physical controls', async ({ page }) => {
  const state = await setup(page, 'TEACHER')
  await expect(page.getByRole('button', { name: 'Thêm phòng', exact: true })).toHaveCount(0)
  await page.getByRole('article', { name: 'Phòng 102', exact: true }).getByRole('link', { name: 'Lịch & vận hành' }).click()
  await expect(page).toHaveURL(/classroom\?roomId=102$/)
  await expect(page.getByText('Phòng chưa kết nối IoT', { exact: true })).toBeVisible()
  await page.getByLabel('Môn học / nội dung').fill('Thực hành mạng')
  await page.getByLabel('Sĩ số dự kiến').fill('30')
  await page.getByLabel('Bắt đầu (UTC+07)', { exact: true }).fill('2026-11-10T08:00')
  await page.getByLabel('Kết thúc (UTC+07)', { exact: true }).fill('2026-11-10T10:00')
  await page.getByRole('button', { name: 'Gửi đăng ký' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Thực hành mạng' })).toContainText('Phòng 102')
  expect(state.calls.find(c => c.method === 'POST' && c.path.endsWith('/bookings')).body).toMatchObject({ roomId: 102, expectedAttendees: 30 })
  await expect(page.getByRole('button', { name: 'Kết quả điều khiển', exact: true })).toHaveCount(0)
})

test('mobile building fits and load errors retain visibly stale information', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await setup(page, 'STUDENT')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Quản lý', exact: true })).toHaveCount(0)
  state.fail = true
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Dữ liệu bên dưới là lần tải trước')
  await expect(page.locator('.building-room')).toHaveCount(15)
})
