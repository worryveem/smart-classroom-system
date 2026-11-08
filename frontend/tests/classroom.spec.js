import { test, expect } from '@playwright/test'

const headers = { 'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS' }
async function setup(page, role = 'ADMIN') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'fixture', userId: 1, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`
  await page.addInitScript(token => sessionStorage.setItem('smartclass.accessToken', token), token)
  const state = { calls: [], bookings: [{ id: 7, owner_id: 1, owner_name: 'fixture', title: 'Thực hành cảm biến', starts_at: '2026-11-10T08:00:00', ends_at: '2026-11-10T10:00:00', status: 'PENDING', decision_note: '' }], incidents: [], fail: false }
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const reply = (data, status = 200, message = 'Thành công') => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, message }) })
    if (method === 'OPTIONS') return reply(null)
    const body = request.postDataJSON(); state.calls.push({ path, method, body })
    if (path === '/api/auth/me') return reply({ id: 1, username: 'fixture', role })
    if (path === '/api/iot/rooms/101') return reply({ id: 101, status: 'ACTIVE', iotEnabled: true, devices: [], incidentSummary: [] })
    if (path === '/api/building/rooms') return reply([{ id: 101, status: 'ACTIVE', floor_number: 1, capacity: 40 }])
    if (state.fail) return reply(null, 503, 'Chưa kết nối được database')
    if (path.endsWith('/settings')) return reply({ name: 'Phòng thử nghiệm', sensor_device_id: 'node1_sensor', temperature_limit: 32, minimum_lux: 150, sustained_seconds: 120, offline_seconds: 300 })
    if (path.endsWith('/permission')) return reply({ allowed: role === 'ADMIN', reason: role === 'ADMIN' ? 'Quản trị viên được điều khiển phòng' : 'Chỉ xem khi chưa có lịch đang diễn ra', bookingId: 0 })
    if (path.endsWith('/bookings') && method === 'POST') { state.bookings.push({ id: 8, owner_id: 1, owner_name: 'fixture', title: body.title, starts_at: body.startsAt, ends_at: body.endsAt, status: 'PENDING' }); return reply(state.bookings.at(-1)) }
    if (path.endsWith('/bookings')) return reply(state.bookings)
    if (path.endsWith('/bookings/7') && method === 'PATCH') { Object.assign(state.bookings[0], { status: body.status, decision_note: body.note }); return reply(state.bookings[0]) }
    if (path.endsWith('/bookings/7') && method === 'PUT') { if (state.editConflict) return reply(null, 409, 'Khung giờ đã có lịch'); Object.assign(state.bookings[0], { title: body.title, starts_at: body.startsAt, ends_at: body.endsAt }); return reply(state.bookings[0]) }
    if (path.endsWith('/bookings/7/report')) return reply({ booking: state.bookings[0], environment: { samples: 0, average_temp: null, average_humid: null, average_lux: null, hot_samples: 0, dark_occupied_samples: 0 }, commands: [], alerts: [], note: 'Chỉ thống kê mẫu đo thật đã lưu.' })
    if (path.endsWith('/incidents') && method === 'POST') { state.incidents.push({ id: 3, ...body, reporter_name: 'fixture', status: 'OPEN', created_at: '2026-11-08T18:00:00' }); return reply(state.incidents[0]) }
    if (path.endsWith('/incidents')) return reply(state.incidents)
    if (path.endsWith('/alerts')) return reply([{ id: 2, message: 'Chưa nhận dữ liệu cảm biến', started_at: '2026-11-08T18:00:00', acknowledged_at: state.ack ? '2026-11-08T18:01:00' : null, acknowledged_by: 'fixture', ended_at: null }])
    if (path.endsWith('/acknowledge')) { state.ack = true; return reply(null) }
    if (path.endsWith('/attempts')) return reply([{ id: 1, actor_name: 'fixture', target: 'FAN', action: 'ON', status: 'TIMEOUT', log_status: 'NOT_RECORDED', message: 'Chưa xác định thiết bị đã thực thi', created_at: '2026-11-08T18:00:00' }])
    return reply(null, 404)
  })
  await page.goto('/classroom')
  await expect(page.getByRole('heading', { name: 'Vận hành phòng học' })).toBeVisible()
  await expect(page.getByText('Thực hành cảm biến', { exact: true })).toBeVisible()
  return state
}

test('teacher registers a lesson and admin decisions require confirmation', async ({ page }) => {
  const state = await setup(page)
  await page.getByLabel('Môn học / nội dung').fill('Kiểm thử hệ thống')
  await page.getByLabel('Bắt đầu (UTC+07)', { exact: true }).fill('2026-11-11T08:00')
  await page.getByLabel('Kết thúc (UTC+07)', { exact: true }).fill('2026-11-11T10:00')
  await page.getByRole('button', { name: 'Gửi đăng ký' }).click()
  await expect(page.getByText('Kiểm thử hệ thống', { exact: true })).toBeVisible()
  expect(state.calls.find(c => c.method === 'POST' && c.path.endsWith('/bookings')).body).toEqual({ title: 'Kiểm thử hệ thống', startsAt: '2026-11-11T08:00:00', endsAt: '2026-11-11T10:00:00', roomId: 101, expectedAttendees: 1 })
  await page.getByRole('row').filter({ hasText: 'Thực hành cảm biến' }).getByRole('button', { name: 'Duyệt', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(state.calls.filter(c => c.method === 'PATCH')).toHaveLength(0)
  await dialog.getByLabel('Ghi chú quyết định').fill('Đã xác nhận lịch')
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Thực hành cảm biến' })).toContainText('Đã duyệt')
})

test('empty real report stays empty and exports CSV', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Báo cáo', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Chưa có dữ liệu', { exact: true })).toHaveCount(3)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Tải báo cáo CSV' }).click()
  expect((await download).suggestedFilename()).toBe('bao-cao-buoi-7.csv')
})

test('student can report incidents but cannot approve or configure the room', async ({ page }) => {
  const state = await setup(page, 'STUDENT')
  await expect(page.getByRole('button', { name: 'Gửi đăng ký' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cấu hình phòng' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sự cố & bảo trì' }).click()
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Đèn nhấp nháy')
  await page.getByLabel('Mô tả sự cố').fill('Đèn nhấp nháy khi đang học.')
  await page.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Đèn nhấp nháy' })).toContainText('Mới báo')
  expect(state.incidents).toHaveLength(1)
  await expect(page.getByRole('button', { name: 'Cập nhật', exact: true })).toHaveCount(0)
})

test('editing a pending booking keeps the form on conflict and saves after correction', async ({ page }) => {
  const state = await setup(page, 'TEACHER')
  await page.getByRole('button', { name: 'Sửa đăng ký', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nội dung đăng ký', { exact: true }).fill('Nội dung đã sửa')
  state.editConflict = true
  await dialog.getByRole('button', { name: 'Lưu đăng ký', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Khung giờ đã có lịch')
  await expect(dialog.getByLabel('Nội dung đăng ký')).toHaveValue('Nội dung đã sửa')
  state.editConflict = false
  await dialog.getByRole('button', { name: 'Lưu đăng ký', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('table')).toContainText('Nội dung đã sửa')
})

test('acknowledgement does not mark an active alert as ended and timeout is explicit', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Cảnh báo', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận đã xem' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Chưa nhận dữ liệu cảm biến' })).toContainText('Đang diễn ra')
  await expect(page.getByRole('button', { name: 'Xác nhận đã xem' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Kết quả điều khiển' }).click()
  await expect(page.getByRole('cell', { name: 'Hết thời gian chờ', exact: true })).toBeVisible()
  await expect(page.getByText(/không tự gửi lại/)).toBeVisible()
})

test('mobile layout remains within viewport and refresh errors are visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await setup(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  state.fail = true
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Chưa kết nối được database')
})
