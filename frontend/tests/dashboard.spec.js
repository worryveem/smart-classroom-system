import { test, expect } from '@playwright/test'

const headers = { 'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
function token() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: 'dashboard_fixture', userId: 91, role: 'TEACHER', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only-signature`
}
async function setup(page, options = {}) {
  const state = {
    status: 200, historyStatus: 200, controlStatus: 200, outcome: 'SUCCESS', logStatus: 'SAVED', controlDeviceId: 'node2_actuator',
    calls: [],
    payload: {
      node1_sensor: { device_id: 'node1_sensor', temp: 29.5, humid: 71, lux: 230, occupancy: 1, connected: true, timestamp: '2026-11-08T09:30:00' },
      node2_actuator: { device_id: 'node2_actuator', FAN: false, LIGHT: true, online: true, AUTO: true, timestamp: '2026-11-08T09:30:00' },
    },
    history: [
      { id: 3, device_id: 'node1_sensor', temp: 29.5, humid: 71, lux: 230, timestamp: '2026-11-08T09:30:00' },
      { id: 2, device_id: 'node1_sensor', temp: 28, humid: 69, lux: 210, timestamp: '2026-11-08T09:20:00' },
      { id: 1, device_id: 'node1_sensor', temp: 27, humid: 68, lux: 190, timestamp: '2026-11-08T09:10:00' },
    ], ...options,
  }
  const fixtureToken = token()
  await page.addInitScript(value => sessionStorage.setItem('smartclass.accessToken', value), fixtureToken)
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers })
    state.calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), method: request.method(), body: request.postDataJSON(), authorization: request.headers().authorization })
    let status = 200, data
    if (url.pathname === '/api/auth/me') data = { id: 91, username: 'dashboard_fixture', role: 'TEACHER' }
    else if (url.pathname === '/api/classroom/permission') data = { allowed: state.permissionAllowed !== false, reason: state.permissionAllowed === false ? 'Bạn cần lịch đã duyệt đang trong giờ sử dụng' : 'Đang trong ca được cấp quyền', bookingId: 1 }
    else if (url.pathname === '/api/state') {
      if (state.stateWait) await state.stateWait
      status = state.status; data = state.payload
    } else if (url.pathname === '/api/telemetry') {
      status = state.historyStatus; data = state.history
    } else if (url.pathname === '/api/control') {
      if (state.controlWait) await state.controlWait
      if (state.controlAbort) return route.abort('failed')
      status = state.controlStatus
      data = { ...request.postDataJSON(), device_id: state.controlDeviceId, trigger_by: 'dashboard_fixture', status: state.outcome, log_status: state.logStatus, retry_safe: false }
    } else return route.fulfill({ status: 404, headers, contentType: 'application/json', body: '{"success":false,"data":null}' })
    return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status >= 200 && status < 300, message: 'Test response', data }) })
  })
  return { state, fixtureToken }
}
const calls = (state, path) => state.calls.filter(call => call.path === path)
async function ready(page) {
  await page.goto('/dashboard')
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true })).toContainText('29,5')
}

test('teacher without an approved active booking cannot send physical commands', async ({ page }) => {
  const { state } = await setup(page, { permissionAllowed: false })
  await ready(page)
  await expect(page.getByText('Bạn cần lịch đã duyệt đang trong giờ sử dụng')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
  expect(calls(state, '/api/control')).toHaveLength(0)
})

test.beforeEach(async ({ page }) => {
  page.runtimeErrors = []
  page.on('pageerror', error => page.runtimeErrors.push(error.message))
})
test.afterEach(async ({ page }) => { expect(page.runtimeErrors).toEqual([]) })

test('shows sensor values, explicit connections, AUTO and chronological real chart data', async ({ page }) => {
  const { state, fixtureToken } = await setup(page)
  await ready(page)
  await expect(page.getByRole('article', { name: 'Độ ẩm', exact: true })).toContainText('71')
  await expect(page.getByRole('article', { name: 'Ánh sáng', exact: true })).toContainText('230')
  await expect(page.getByRole('article', { name: 'Chuyển động PIR' })).toContainText('Có người')
  await expect(page.getByRole('article', { name: 'Điều khiển FAN' })).toContainText('OFF')
  await expect(page.getByRole('article', { name: 'Điều khiển LIGHT' })).toContainText('ON')
  await expect(page.locator('.auto-status')).toContainText('Đang bật')
  await expect(page.getByRole('button', { name: /AUTO/ })).toHaveCount(0)
  await expect(page.locator('.recharts-line')).toHaveCount(3)
  const mapped = await page.evaluate(async () => {
    const { fetchTelemetry } = await import('/src/features/dashboard/services/dashboardService.js')
    return (await fetchTelemetry('recent')).rows.map(row => ({ temp: row.temp, timestamp: row.timestamp, time: row.time }))
  })
  expect(mapped.map(row => row.temp)).toEqual([27, 28, 29.5])
  expect(mapped[0].time).toBe(Date.parse('2026-11-08T09:10:00+07:00'))
  await page.locator('.recharts-line-dots .recharts-dot').first().hover()
  await expect(page.locator('.chart-tooltip')).toContainText('09:10:00')
  await expect(page.locator('.chart-tooltip')).toContainText('°C')
  await page.getByRole('checkbox', { name: /Ánh sáng/ }).uncheck()
  await expect(page.locator('.recharts-line')).toHaveCount(2)
  await page.getByLabel('Khoảng thời gian').selectOption('1h')
  await expect.poll(() => calls(state, '/api/telemetry').at(-1).params.from).toBeTruthy()
  const params = calls(state, '/api/telemetry').at(-1).params
  expect(params.deviceId).toBe('node1_sensor'); expect(params.limit).toBe('500')
  expect(params.from).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(Date.parse(params.to) - Date.parse(params.from)).toBe(3600000)
  expect(state.calls.every(call => call.authorization === `Bearer ${fixtureToken}`)).toBe(true)
  expect(calls(state, '/api/control')).toHaveLength(0)
})

test('polling is sequential, coalesces refreshes, pauses in background and stops on navigation', async ({ page }) => {
  await page.clock.install()
  const { state } = await setup(page)
  await ready(page)
  let release
  state.stateWait = new Promise(resolve => { release = resolve })
  const before = calls(state, '/api/state').length
  await page.clock.fastForward(4100)
  await expect.poll(() => calls(state, '/api/state').length).toBe(before + 1)
  await page.clock.fastForward(20000)
  expect(calls(state, '/api/state')).toHaveLength(before + 1)
  expect(calls(state, '/api/telemetry')).toHaveLength(1)
  state.stateWait = null; release()
  await expect(page.getByRole('button', { name: 'Làm mới trạng thái' })).toBeEnabled()
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
  const paused = calls(state, '/api/state').length
  await page.clock.fastForward(40000)
  expect(calls(state, '/api/state')).toHaveLength(paused)
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => calls(state, '/api/state').length).toBe(paused + 1)
  const historyRead = page.waitForRequest(request => request.url().includes('/api/telemetry?') && new URL(request.url()).searchParams.get('limit') === '100')
  await page.getByRole('link', { name: 'Lịch sử', exact: true }).click()
  await page.clock.runFor(500)
  await historyRead
  await expect(page.locator('.history-table tbody tr')).toHaveCount(3)
  const stopped = calls(state, '/api/state').length
  const stoppedHistory = calls(state, '/api/telemetry').length
  await page.clock.fastForward(40000)
  expect(calls(state, '/api/state')).toHaveLength(stopped)
  expect(calls(state, '/api/telemetry')).toHaveLength(stoppedHistory)
})

test('four commands use exact bodies, ACKs do not optimistically change state, and log errors preserve outcome', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  let release
  state.controlWait = new Promise(resolve => { release = resolve })
  await page.getByRole('button', { name: 'Bật FAN', exact: true }).click()
  await expect.poll(() => calls(state, '/api/control').length).toBe(1)
  await expect(page.getByRole('button', { name: 'Tắt LIGHT', exact: true })).toBeDisabled()
  await expect(page.getByRole('article', { name: 'Điều khiển FAN' }).locator('.device-value')).toHaveText('OFF')
  state.controlWait = null; release()
  await expect(page.locator('.command-result')).toContainText('SUCCESS')
  await expect(page.getByRole('article', { name: 'Điều khiển FAN' }).locator('.device-value')).toHaveText('OFF')
  state.payload.node2_actuator.FAN = true
  await page.getByRole('button', { name: 'Làm mới trạng thái' }).click()
  await expect(page.getByRole('article', { name: 'Điều khiển FAN' }).locator('.device-value')).toHaveText('ON')
  state.outcome = 'ACCEPTED'; state.controlStatus = 202
  await page.getByRole('button', { name: 'Tắt FAN', exact: true }).click()
  await expect(page.locator('.command-result')).toContainText('ACCEPTED')
  await expect(page.locator('.command-result')).toContainText('chưa xác nhận thiết bị thực thi')
  await expect(page.getByRole('article', { name: 'Điều khiển FAN' }).locator('.device-value')).toHaveText('ON')
  state.outcome = 'FAILURE'; state.controlStatus = 502
  await expect(page.getByRole('button', { name: 'Tắt LIGHT', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Tắt LIGHT', exact: true }).click()
  await expect(page.locator('.command-result')).toContainText('FAILURE')
  state.payload.node2_actuator.LIGHT = false
  await page.getByRole('button', { name: 'Làm mới trạng thái' }).click()
  await expect(page.getByRole('article', { name: 'Điều khiển LIGHT' }).locator('.device-value')).toHaveText('OFF')
  state.outcome = 'SUCCESS'; state.controlStatus = 500; state.logStatus = 'FAILED'
  await page.getByRole('button', { name: 'Bật LIGHT', exact: true }).click()
  await expect(page.locator('.command-result')).toContainText('SUCCESS')
  await expect(page.locator('.command-result')).toContainText('Không lưu được lịch sử')
  expect(calls(state, '/api/control').map(call => call.body)).toEqual([
    { target: 'FAN', action: 'ON' }, { target: 'FAN', action: 'OFF' }, { target: 'LIGHT', action: 'OFF' }, { target: 'LIGHT', action: 'ON' },
  ])
})

for (const outcome of ['SUCCESS', 'ACCEPTED']) test(`ACK ${outcome} for a different device stays unconfirmed and never retries`, async ({ page }) => {
  await page.clock.install()
  const { state } = await setup(page, { outcome, controlStatus: outcome === 'ACCEPTED' ? 202 : 200, controlDeviceId: 'node3_actuator' })
  await ready(page)
  await page.getByRole('button', { name: 'Bật FAN', exact: true }).click()
  await expect(page.locator('.command-result')).toContainText('UNCONFIRMED')
  await expect(page.locator('.command-result')).toContainText('thiết bị khác với cấu hình Dashboard')
  await expect(page.locator('.command-result')).toHaveClass(/result-warning/)
  await expect(page.getByRole('article', { name: 'Điều khiển FAN' }).locator('.device-value')).toHaveText('OFF')
  await page.clock.fastForward(15000)
  expect(calls(state, '/api/control').map(call => call.body)).toEqual([{ target: 'FAN', action: 'ON' }])
})

test('timeout and network errors never retry commands automatically', async ({ page }) => {
  await page.clock.install()
  const { state } = await setup(page, { outcome: 'TIMEOUT', controlStatus: 504 })
  await ready(page)
  await page.getByRole('button', { name: 'Bật FAN', exact: true }).click()
  await expect(page.locator('.command-result')).toContainText('TIMEOUT')
  await page.clock.fastForward(15000)
  expect(calls(state, '/api/control')).toHaveLength(1)
  state.controlAbort = true
  await page.getByRole('button', { name: 'Tắt LIGHT', exact: true }).click()
  await expect(page.locator('.command-result')).toContainText('UNCONFIRMED')
  await page.clock.fastForward(15000)
  expect(calls(state, '/api/control')).toHaveLength(2)
})

test('errors keep stale state visibly marked; empty history, unknown AUTO and offline controls are safe', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  state.status = 503
  await page.getByRole('button', { name: 'Làm mới trạng thái' }).click()
  await expect(page.getByRole('alert')).toContainText('Chưa kết nối được Node-RED')
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true })).toContainText('29,5')
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true })).toContainText('Dữ liệu cũ')
  await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
  state.status = 200; state.payload.node2_actuator.AUTO = undefined; state.payload.node2_actuator.online = false
  await page.getByRole('button', { name: 'Làm mới trạng thái' }).click()
  await expect(page.locator('.auto-status')).toContainText('Chưa có trạng thái')
  await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
  state.history = []
  await page.getByRole('button', { name: 'Tải lại lịch sử' }).click()
  await expect(page.getByRole('heading', { name: 'Chưa có dữ liệu trong khoảng này' })).toBeVisible()
  state.historyStatus = 500
  await page.getByRole('button', { name: 'Tải lại lịch sử' }).click()
  await expect(page.getByRole('heading', { name: 'Chưa tải được lịch sử' })).toBeVisible()
})

test('missing or unfamiliar fields are not coerced to zeros, false occupancy or online status', async ({ page }) => {
  const { state } = await setup(page, { payload: { unexpected: true } })
  await page.goto('/dashboard')
  await expect(page.getByRole('alert')).toContainText('Chưa nhận diện được cấu trúc State')
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true }).locator('.sensor-value')).toHaveText('—')
  await expect(page.getByRole('article', { name: 'Chuyển động PIR' }).locator('.sensor-value')).toHaveText('—')
  state.payload = { device_id: 'node1_sensor', temp: 0, humid: null, lux: '0', occupancy: 0, FAN: 'OFF', LIGHT: 'ON', status: 'Active' }
  await page.getByRole('button', { name: 'Làm mới trạng thái' }).click()
  await expect(page.getByRole('article', { name: 'Chuyển động PIR' })).toContainText('Không có người')
  await expect(page.getByRole('article', { name: 'Nhiệt độ', exact: true }).locator('.sensor-value')).toContainText('0')
  await expect(page.getByRole('article', { name: 'Độ ẩm', exact: true }).locator('.sensor-value')).toHaveText('—')
  await expect(page.getByRole('article', { name: 'Điều khiển LIGHT' })).toContainText('Chưa rõ kết nối')
})

test('JWT invalidation redirects and stops dashboard traffic; logout remains available', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  state.status = 401
  await page.getByRole('button', { name: 'Làm mới trạng thái' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => sessionStorage.getItem('smartclass.accessToken'))).toBeNull()
})

for (const payload of [
  { device_id: 'other_actuator', FAN: false, LIGHT: true, online: true, AUTO: true },
  { node2_actuator: { device_id: 'other_actuator', FAN: false, LIGHT: true, online: true, AUTO: true } },
]) {
  test(`state from a different device never enables configured actuator controls: ${payload.device_id ? 'flat' : 'keyed'}`, async ({ page }) => {
    const { state } = await setup(page, { payload })
    await page.goto('/dashboard')
    await expect(page.locator('.state-summary')).toContainText('Đã nhận State')
    await expect(page.getByRole('article', { name: 'Điều khiển FAN' }).locator('.device-value')).toHaveText('Chưa rõ')
    await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Tắt LIGHT', exact: true })).toBeDisabled()
    await expect(page.locator('.auto-status')).toContainText('Chưa có trạng thái')
    expect(calls(state, '/api/control')).toHaveLength(0)
  })
}

test('desktop, tablet and mobile layouts fit; AUTO has no command action', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  await expect(page.locator('.recharts-line')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true })
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `Layout must fit viewport ${width}` }).toBe(true)
    await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeVisible()
  }
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true })
  expect(calls(state, '/api/control')).toHaveLength(0)
  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('real Spring Boot telemetry and state unavailability are displayed without physical commands', async ({ page }) => {
  test.skip(process.env.SMARTCLASS_E2E_BACKEND !== '1', 'Enable with a running backend and environment test credentials')
  const username = process.env.AUTH_TEACHER_USERNAME, password = process.env.AUTH_TEACHER_PASSWORD
  if (!username || !password) throw new Error('Set teacher test credentials in the environment')
  const outbound = []
  page.on('request', request => { if (request.url().includes('/api/control')) outbound.push(request) })
  await page.goto('/login')
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  const telemetryResponse = page.waitForResponse(response => response.url().includes('/api/telemetry?') && response.request().method() === 'GET')
  const stateResponse = page.waitForResponse(response => response.url().endsWith('/api/state') && response.request().method() === 'GET')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  const history = await telemetryResponse, current = await stateResponse
  expect(history.status()).toBe(200)
  const rows = (await history.json()).data
  expect(Array.isArray(rows)).toBe(true)
  await expect(page.locator('.chart-footer')).toContainText(`${rows.length} mẫu hợp lệ`)
  if (current.status() !== 200) {
    await expect(page.locator('.dashboard-alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bật FAN', exact: true })).toBeDisabled()
  }
  expect(outbound).toHaveLength(0)
  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
