import { test, expect } from '@playwright/test'
test.use({ timezoneId: 'America/New_York' })

const headers = { 'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,OPTIONS' }

test('student cannot open command history even through the URL', async ({ page }) => {
  const { state } = await setup(page, { role: 'STUDENT' })
  await page.goto('/history?tab=commands')
  await expect(page.getByRole('tab', { name: 'Lịch sử điều khiển', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Lịch sử cảm biến', exact: true })).toBeVisible()
  expect(state.calls.some(call => call.path === '/api/commands')).toBe(false)
})

test('teacher command history does not offer another actor filter', async ({ page }) => {
  await setup(page, { role: 'TEACHER' })
  await ready(page)
  await page.getByRole('tab', { name: 'Lịch sử điều khiển', exact: true }).click()
  await expect(page.getByLabel('Người thực hiện', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Nhật ký điều khiển chỉ hiển thị lệnh do bạn thực hiện.')).toBeVisible()
})
const millis = value => Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}+07:00`)
const historyCalls = (state, path) => state.calls.filter(call => call.path === path)

async function setup(page, options = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'history_fixture', userId: 111, role: options.role || 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only-signature`
  const state = {
    calls: [], telemetryStatus: 200, commandStatus: 200,
    telemetry: [
      { id: 8, device_id: 'node1_sensor', temp: 29.5, humid: 71, lux: 230, occupancy: true, timestamp: '2026-11-08T03:00:00Z' },
      { id: 7, device_id: 'node1_sensor', temp: 0, humid: 0, lux: 0, occupancy: false, timestamp: '2026-11-08T09:59:00' },
      { id: 6, device_id: 'node1_sensor', temp: null, humid: null, lux: null, occupancy: null, timestamp: '2026-11-08T09:58:00' },
    ],
    commands: Array.from({ length: 45 }, (_, i) => ({ id: 45 - i, device_id: i % 4 === 0 ? 'node3_actuator' : 'node2_actuator', target: i % 2 === 0 ? 'FAN' : 'LIGHT', action: i % 2 === 0 ? 'ON' : 'OFF', trigger_by: i % 3 === 0 ? 'RULE_ENGINE' : 'teacher_one', timestamp: `2026-11-08T10:00:${String(44 - i).padStart(2, '0')}` })),
    ...options,
  }
  await page.addInitScript(value => sessionStorage.setItem('smartclass.accessToken', value), token)
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), params = Object.fromEntries(url.searchParams)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers })
    state.calls.push({ path: url.pathname, params, method: request.method(), authorization: request.headers().authorization })
    let status = 200, data
    const filter = rows => rows.filter(row => (!params.deviceId || row.device_id === params.deviceId)
      && (!params.from || millis(row.timestamp) >= millis(params.from)) && (!params.to || millis(row.timestamp) <= millis(params.to))
      && (!params.target || row.target === params.target) && (!params.triggerBy || row.trigger_by === params.triggerBy))
    if (url.pathname === '/api/auth/me') data = { id: 111, username: 'history_fixture', role: options.role || 'ADMIN' }
    else if (url.pathname === '/api/telemetry') {
      if (params.deviceId === state.deferredDevice && state.wait) await state.wait
      if (state.network) return route.abort('failed')
      status = state.telemetryStatus
      data = state.malformed ? { unexpected: true } : filter(state.telemetry).slice(0, Number(params.limit || 100))
    } else if (url.pathname === '/api/commands') {
      status = state.commandStatus
      const rows = filter(state.commands), page = Number(params.page || 0), size = Number(params.size || 20)
      data = { content: rows.slice(page * size, (page + 1) * size), page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) }
    } else return route.fulfill({ status: 404, headers, contentType: 'application/json', body: '{"success":false,"data":null}' })
    return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status === 200, message: 'Test response', data: status === 200 ? data : null }) })
  })
  return { state, token }
}
async function ready(page) {
  await page.goto('/history')
  await expect(page.locator('.history-table tbody tr')).toHaveCount(3)
  await expect(page.getByRole('region', { name: 'Bảng lịch sử cảm biến' })).toContainText('29,5')
}
test.beforeEach(async ({ page }) => {
  page.runtimeErrors = []
  page.on('pageerror', error => page.runtimeErrors.push(error.message))
})
test.afterEach(async ({ page }) => { expect(page.runtimeErrors).toEqual([]) })

test('telemetry renders server fields, Vietnam time, zero/null values and PIR without synthetic data', async ({ page }) => {
  const { state, token } = await setup(page)
  await ready(page)
  const rows = page.locator('.history-table tbody tr')
  await expect(rows.nth(0)).toContainText('10:00:00')
  await expect(rows.nth(0)).toContainText('08/11/2026')
  await expect(rows.nth(0)).toContainText('Có người')
  await expect(rows.nth(1).locator('td.number-cell')).toHaveText(['0', '0', '0'])
  await expect(rows.nth(1)).toContainText('Không có người')
  await expect(rows.nth(2).locator('td.number-cell')).toHaveText(['—', '—', '—'])
  await expect(rows.nth(2)).toContainText('Chưa rõ')
  expect(historyCalls(state, '/api/telemetry').at(-1).params).toEqual({ limit: '100' })
  expect(state.calls.every(call => call.method === 'GET' && call.authorization === `Bearer ${token}`)).toBe(true)
  expect(historyCalls(state, '/api/commands')).toHaveLength(0)
  expect(state.calls.some(call => call.path === '/api/devices' || call.path === '/api/control')).toBe(false)
})

test('filters debounce, send exact inclusive local timestamps and reject invalid ranges or limits', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  const before = historyCalls(state, '/api/telemetry').length
  await page.getByLabel('Thiết bị', { exact: true }).pressSequentially('node1_sensor', { delay: 20 })
  await expect.poll(() => historyCalls(state, '/api/telemetry').length).toBe(before + 1)
  await page.getByLabel('Từ thời điểm').fill('2026-11-08T09:59:00')
  await page.getByLabel('Đến thời điểm').fill('2026-11-08T10:00:00')
  await page.getByLabel('Số bản ghi mới nhất').fill('2')
  await expect(page.locator('.history-table tbody tr')).toHaveCount(2)
  expect(historyCalls(state, '/api/telemetry').at(-1).params).toEqual({ deviceId: 'node1_sensor', from: '2026-11-08T09:59:00', to: '2026-11-08T10:00:00', limit: '2' })
  await expect(page.locator('.history-limit-note')).toContainText('Đã đạt giới hạn 2')
  const count = historyCalls(state, '/api/telemetry').length
  await page.getByLabel('Đến thời điểm').fill('2026-11-08T09:58:00')
  await expect(page.getByRole('alert')).toContainText('Thời điểm kết thúc phải bằng hoặc sau')
  await expect(page.getByRole('heading', { name: 'Vui lòng kiểm tra bộ lọc' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Làm mới dữ liệu' })).toBeDisabled()
  await page.waitForTimeout(600)
  expect(historyCalls(state, '/api/telemetry')).toHaveLength(count)
  await page.getByLabel('Số bản ghi mới nhất').fill('1001')
  await expect(page.getByText('Nhập số nguyên từ 1 đến 1000.')).toBeVisible()
  await page.getByRole('button', { name: 'Đặt lại bộ lọc' }).click()
  await expect(page.locator('.history-table tbody tr')).toHaveCount(3)
  await expect(page.getByLabel('Thiết bị', { exact: true })).toHaveValue('')
})

test('commands use backend pagination, page sizes, totals and reset page on filter changes', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  await page.getByRole('tab', { name: 'Lịch sử điều khiển' }).click()
  await expect(page.locator('.history-table tbody tr')).toHaveCount(20)
  await expect(page.getByRole('navigation', { name: 'Phân trang lịch sử điều khiển' })).toContainText('Trang 1 / 3')
  await expect(page.locator('.history-pagination')).toContainText('45')
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Phân trang lịch sử điều khiển' })).toContainText('Trang 2 / 3')
  expect(historyCalls(state, '/api/commands').at(-1).params).toEqual({ page: '1', size: '20' })
  await page.getByRole('button', { name: 'Trang cuối', exact: true }).click()
  await expect(page.locator('.history-table tbody tr')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Trang sau', exact: true })).toBeDisabled()
  await page.getByLabel('Số bản ghi / trang').selectOption('10')
  await expect(page.locator('.history-table tbody tr')).toHaveCount(10)
  await expect(page.getByRole('navigation', { name: 'Phân trang lịch sử điều khiển' })).toContainText('Trang 1 / 5')
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Phân trang lịch sử điều khiển' })).toContainText('Trang 2 / 5')
  await page.getByLabel('Đối tượng', { exact: true }).selectOption('FAN')
  await expect.poll(() => historyCalls(state, '/api/commands').at(-1).params.target).toBe('FAN')
  expect(historyCalls(state, '/api/commands').at(-1).params.page).toBe('0')
  expect(historyCalls(state, '/api/commands').every(call => Number(call.params.size) <= 100)).toBe(true)
})

test('command filters combine all fields and distinguish rule engine, usernames and ON/OFF', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  await page.getByRole('tab', { name: 'Lịch sử điều khiển' }).click()
  await expect(page.locator('.history-table tbody tr')).toHaveCount(20)
  await expect(page.locator('.badge-rule').first()).toHaveText('RULE_ENGINE')
  await expect(page.locator('.badge-user').first()).toHaveText('teacher_one')
  await expect(page.locator('.badge-on').first()).toHaveText('ON')
  await expect(page.locator('.badge-off').first()).toHaveText('OFF')
  await page.getByLabel('Thiết bị', { exact: true }).fill('node2_actuator')
  await page.getByLabel('Đối tượng', { exact: true }).selectOption('FAN')
  await page.getByLabel('Người thực hiện', { exact: true }).fill('RULE_ENGINE')
  await page.getByLabel('Từ thời điểm').fill('2026-11-08T10:00:00')
  await page.getByLabel('Đến thời điểm').fill('2026-11-08T10:00:44')
  await expect.poll(() => historyCalls(state, '/api/commands').at(-1).params.to).toBe('2026-11-08T10:00:44')
  const last = historyCalls(state, '/api/commands').at(-1).params
  expect(last).toEqual({ deviceId: 'node2_actuator', target: 'FAN', triggerBy: 'RULE_ENGINE', from: '2026-11-08T10:00:00', to: '2026-11-08T10:00:44', page: '0', size: '20' })
  await expect(page.locator('.history-table tbody .badge-user')).toHaveCount(0)
  await expect(page.locator('.history-table tbody .history-target').first()).toHaveText('FAN')
})

test('tabs preserve independent filters and reuse loaded results without background requests', async ({ page }) => {
  await page.clock.install()
  const { state } = await setup(page)
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: 'Lịch sử', exact: true })).toBeVisible()
  await page.clock.runFor(500)
  await expect(page.locator('.history-table tbody tr')).toHaveCount(3)
  await page.getByLabel('Số bản ghi mới nhất').fill('2')
  await page.clock.runFor(500)
  await expect(page.locator('.history-table tbody tr')).toHaveCount(2)
  await page.getByRole('tab', { name: 'Lịch sử điều khiển' }).click()
  await page.clock.runFor(20)
  await expect(page.locator('.history-table tbody tr')).toHaveCount(20)
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await page.clock.runFor(20)
  await expect(page.getByRole('navigation', { name: 'Phân trang lịch sử điều khiển' })).toContainText('Trang 2 / 3')
  const count = state.calls.length
  await page.getByRole('tab', { name: 'Lịch sử cảm biến' }).click()
  await expect(page.getByLabel('Số bản ghi mới nhất')).toHaveValue('2')
  await expect(page.locator('.history-table tbody tr')).toHaveCount(2)
  await page.getByRole('tab', { name: 'Lịch sử điều khiển' }).click()
  await expect(page.getByRole('navigation', { name: 'Phân trang lịch sử điều khiển' })).toContainText('Trang 2 / 3')
  await page.clock.fastForward(60000)
  expect(state.calls).toHaveLength(count)
})

test('empty, malformed and backend error states support refresh without fabricating rows', async ({ page }) => {
  const { state } = await setup(page, { telemetry: [] })
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: 'Không có dữ liệu phù hợp' })).toBeVisible()
  state.telemetryStatus = 500
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
  await expect(page.getByRole('alert')).toContainText('Chưa tải được lịch sử từ Backend')
  await expect(page.getByRole('heading', { name: 'Chưa tải được dữ liệu' })).toBeVisible()
  state.telemetryStatus = 200; state.malformed = true
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
  await expect(page.getByRole('alert')).toContainText('Dữ liệu lịch sử trả về chưa đúng cấu trúc')
  state.malformed = false; state.network = true
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
  await expect(page.getByRole('alert')).toContainText('Không kết nối được Backend')
  expect(await page.evaluate(() => sessionStorage.getItem('smartclass.accessToken'))).not.toBeNull()
  state.network = false
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
  await expect(page.getByRole('heading', { name: 'Không có dữ liệu phù hợp' })).toBeVisible()
  await page.getByRole('tab', { name: 'Lịch sử điều khiển' }).click()
  await expect(page.locator('.history-table tbody tr')).toHaveCount(20)
  state.commandStatus = 500
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
  await expect(page.getByRole('alert')).toContainText('dữ liệu của lần tải trước')
  await expect(page.locator('.history-table tbody tr')).toHaveCount(20)
  state.commandStatus = 200
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('old filtered requests cannot overwrite a newer result and JWT 401 redirects', async ({ page }) => {
  const { state } = await setup(page)
  await ready(page)
  let release
  state.deferredDevice = 'slow_sensor'; state.wait = new Promise(resolve => { release = resolve })
  await page.getByLabel('Thiết bị', { exact: true }).fill('slow_sensor')
  await expect.poll(() => historyCalls(state, '/api/telemetry').at(-1).params.deviceId).toBe('slow_sensor')
  await page.getByLabel('Thiết bị', { exact: true }).fill('node1_sensor')
  await expect(page.getByRole('region', { name: 'Bảng lịch sử cảm biến' })).toContainText('29,5')
  release()
  await expect(page.locator('.history-table tbody tr')).toHaveCount(3)
  state.telemetryStatus = 401
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => sessionStorage.getItem('smartclass.accessToken'))).toBeNull()
  await expect(page.getByText(/Phiên đăng nhập đã hết hạn/)).toBeVisible()
})

test('keyboard tabs and desktop/mobile table scrolling remain usable', async ({ page }) => {
  await setup(page)
  await ready(page)
  await page.screenshot({ path: 'test-results/history-telemetry-desktop.png', fullPage: true })
  await page.getByRole('tab', { name: 'Lịch sử cảm biến' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Lịch sử điều khiển' })).toBeFocused()
  await expect(page.locator('.history-table tbody tr')).toHaveCount(20)
  await page.screenshot({ path: 'test-results/history-commands-desktop.png', fullPage: true })
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(await page.locator('.history-table-scroll').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  await page.locator('.history-table-scroll').evaluate(element => { element.scrollLeft = 400 })
  expect(await page.locator('.history-table-scroll').evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/history-mobile.png', fullPage: true })
})

test('real Spring Boot history reads existing MySQL rows and server pagination without writes', async ({ page }) => {
  test.skip(process.env.SMARTCLASS_E2E_BACKEND !== '1', 'Enable a running backend with environment test credentials')
  const username = process.env.AUTH_TEACHER_USERNAME, password = process.env.AUTH_TEACHER_PASSWORD
  if (!username || !password) throw new Error('Set teacher test credentials in the environment')
  const writes = []
  page.on('request', request => { if (request.url().includes('/api/') && !['GET', 'OPTIONS'].includes(request.method()) && !request.url().endsWith('/api/auth/login')) writes.push(request) })
  await page.goto('/history')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  const telemetryPromise = page.waitForResponse(response => response.url().includes('/api/telemetry?') && response.request().method() === 'GET')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  const telemetry = await telemetryPromise
  expect(telemetry.status()).toBe(200)
  const rows = (await telemetry.json()).data
  if (rows.length) await expect(page.locator('.history-table tbody tr')).toHaveCount(rows.length)
  else await expect(page.getByRole('heading', { name: 'Không có dữ liệu phù hợp' })).toBeVisible()
  if (rows.length) {
    const filteredPromise = page.waitForResponse(response => response.url().includes('/api/telemetry?') && new URL(response.url()).searchParams.get('deviceId') === rows[0].device_id && response.request().method() === 'GET')
    await page.getByLabel('Thiết bị', { exact: true }).fill(rows[0].device_id)
    const filtered = await filteredPromise
    expect(filtered.status()).toBe(200)
    expect((await filtered.json()).data.every(row => row.device_id === rows[0].device_id)).toBe(true)
  }
  const commandsPromise = page.waitForResponse(response => response.url().includes('/api/commands?') && response.request().method() === 'GET')
  await page.getByRole('tab', { name: 'Lịch sử điều khiển' }).click()
  const commands = await commandsPromise
  expect(commands.status()).toBe(200)
  const result = (await commands.json()).data
  if (result.content.length) await expect(page.locator('.history-table tbody tr')).toHaveCount(result.content.length)
  expect(result.page).toBe(0); expect(result.size).toBe(20)
  await expect(page.locator('.history-pagination')).toContainText(String(result.totalElements))
  if (result.content.length) {
    const actor = result.content[0].trigger_by
    const filteredPromise = page.waitForResponse(response => response.url().includes('/api/commands?') && new URL(response.url()).searchParams.get('triggerBy') === actor && response.request().method() === 'GET')
    await page.getByLabel('Người thực hiện', { exact: true }).fill(actor)
    const filtered = await filteredPromise
    expect(filtered.status()).toBe(200)
    expect((await filtered.json()).data.content.every(row => row.trigger_by === actor)).toBe(true)
  }
  expect(writes).toHaveLength(0)
})
