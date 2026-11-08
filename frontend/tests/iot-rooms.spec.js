import { test, expect } from '@playwright/test'

const headers = { 'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
async function setup(page) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'iot_fixture', userId: 1, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only`
  await page.addInitScript(token => sessionStorage.setItem('smartclass.accessToken', token), token)
  const state = { calls: [], wait: null, role: 'ADMIN', allowed: true }
  const rooms = [1, 2, 3].flatMap(f => Array.from({ length: 5 }, (_, i) => ({ id: f * 100 + i + 1, floor_number: f, name: `Phòng ${f * 100 + i + 1}`, capacity: 40, status: 'ACTIVE', sensor_status: 'NO_DATA' })))
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const reply = (data, status = 200, message = 'Thành công') => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, message }) }).catch(() => {})
    if (method === 'OPTIONS') return reply(null)
    const body = request.postDataJSON(); state.calls.push({ path, method, body })
    if (path === '/api/auth/me') return reply({ id: 1, username: 'iot_fixture', role: state.role })
    if (path === '/api/building/overview') return reply({ rooms })
    if (path === '/api/classroom/permission') return reply({ allowed: state.allowed, bookingId: 0, reason: state.allowed ? 'Quản trị viên được điều khiển phòng' : 'Bạn cần lịch đã duyệt tại phòng 101' })
    const match = path.match(/^\/api\/iot\/rooms\/(\d+)(?:\/(state|telemetry|control))?$/)
    if (!match) return reply(null, 404)
    const id = Number(match[1]), action = match[2], room = rooms.find(r => r.id === id)
    if (!room) return reply(null, 404, 'Không tìm thấy phòng trong Nhà A')
    if (!action) return reply({ ...room, iotEnabled: id === 101, sensorId: id === 101 ? 'sensor_101' : null, actuatorId: id === 101 ? 'relay_101' : null })
    if (id !== 101) return reply(null, 409, 'Phòng chưa kết nối IoT')
    if (action === 'state') {
      if (state.wait) await state.wait
      return reply({ sensor_101: { device_id: 'sensor_101', temp: 29.5, humid: 60, lux: 300, occupancy: 1, online: true }, relay_101: { device_id: 'relay_101', FAN: false, LIGHT: true, online: true } })
    }
    if (action === 'telemetry') return reply([{ id: 1, device_id: 'sensor_101', temp: 29.5, humid: 60, lux: 300, timestamp: '2026-11-08T19:00:00' }])
    return reply({ ...body, device_id: 'relay_101', status: 'SUCCESS', log_status: 'SAVED' })
  })
  return state
}

test('IoT navigation lists all rooms and filters by floor or installation', async ({ page }) => {
  await setup(page)
  await page.goto('/iot')
  await expect(page.getByRole('heading', { name: 'Điều khiển IoT', exact: true })).toBeVisible()
  await expect(page.locator('.iot-room-link')).toHaveCount(15)
  await expect(page.getByRole('link', { name: 'Điều khiển IoT', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'IoT phòng 101', exact: true })).toHaveCount(0)
  await page.getByLabel('Tầng', { exact: true }).selectOption('2')
  await expect(page.locator('.iot-room-link')).toHaveCount(5)
  await page.getByLabel('Tầng', { exact: true }).selectOption('')
  await page.getByLabel('Trang bị IoT', { exact: true }).selectOption('installed')
  await expect(page.locator('.iot-room-link')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Mở IoT phòng 101', exact: true })).toBeVisible()
})

test('room 102 has its own empty dashboard and never reads or controls room 101', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/iot')
  await page.getByRole('link', { name: 'Mở IoT phòng 102', exact: true }).click()
  await expect(page).toHaveURL(/\/iot\/rooms\/102$/)
  await expect(page.getByRole('heading', { name: 'IoT phòng 102', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true })).toContainText('—')
  await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Tắt LIGHT', exact: true })).toBeDisabled()
  expect(state.calls.filter(c => /\/(state|telemetry|control)$/.test(c.path))).toHaveLength(0)
  await expect(page.getByRole('link', { name: 'Lịch & vận hành phòng 102' })).toHaveAttribute('href', '/classroom?roomId=102')
})

test('room 101 uses room-scoped APIs and device IDs supplied by Backend', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/iot/rooms/101')
  await expect(page.getByRole('heading', { name: 'IoT phòng 101', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true })).toContainText('29,5')
  await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Bật FAN', exact: true }).click()
  await expect(page.locator('.command-result')).toContainText('Thiết bị đã xác nhận thực thi lệnh')
  expect(state.calls.find(c => c.method === 'POST')).toMatchObject({ path: '/api/iot/rooms/101/control', body: { target: 'FAN', action: 'ON' } })
  expect(state.calls.filter(c => ['/api/state', '/api/telemetry', '/api/control'].includes(c.path))).toHaveLength(0)
})

test('late state from 101 cannot populate 102 after changing rooms', async ({ page }) => {
  const state = await setup(page)
  let release; state.wait = new Promise(resolve => { release = resolve })
  await page.goto('/iot/rooms/101')
  await expect(page.getByRole('heading', { name: 'IoT phòng 101', exact: true })).toBeVisible()
  await expect.poll(() => state.calls.some(c => c.path.endsWith('/101/state'))).toBe(true)
  await page.getByRole('link', { name: /Chọn phòng IoT khác/ }).click()
  await page.getByRole('link', { name: 'Mở IoT phòng 102', exact: true }).click()
  release()
  await expect(page.getByRole('heading', { name: 'IoT phòng 102', exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true })).not.toContainText('29,5')
  await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
  expect(state.calls.filter(c => c.method === 'POST')).toHaveLength(0)
})

test('invalid or unknown room never falls back to 101', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/iot/rooms/999')
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy phòng')
  await page.goto('/iot/rooms/abc')
  await expect(page.getByRole('alert')).toContainText('Số phòng không hợp lệ')
  expect(state.calls.some(c => c.path.includes('/101'))).toBe(false)
})

test('student can inspect IoT but cannot control, and mobile fits', async ({ page }) => {
  const state = await setup(page); state.role = 'STUDENT'; state.allowed = false
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/iot')
  await expect(page.locator('.iot-room-link')).toHaveCount(15)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Mở IoT phòng 101', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true })).toContainText('29,5')
  await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(state.calls.filter(c => c.method === 'POST')).toHaveLength(0)
})
