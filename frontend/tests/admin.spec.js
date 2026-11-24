import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'

const headers = { 'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' }
const calls = (state, method, path) => state.calls.filter(call => call.method === method && call.path === path)
async function setup(page, options = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'admin_current', userId: 1, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only-signature`
  const state = {
    role: 'ADMIN', listStatus: 200, detailStatus: 200, calls: [],
    users: Array.from({ length: 23 }, (_, i) => ({ id: i + 1, username: i === 0 ? 'admin_current' : `member_${String(i + 1).padStart(2, '0')}`, role: i === 0 ? 'ADMIN' : i % 2 ? 'TEACHER' : 'STUDENT', created_at: '2026-11-08T09:00:00', password_hash: 'test-only-must-not-enter-ui-state' })),
    devices: Array.from({ length: 23 }, (_, i) => ({ device_id: `device_${String(i + 1).padStart(2, '0')}`, room_id: 101 + i % 3, type: i % 2 ? 'ACTUATOR' : 'SENSOR', mac_address: i % 2 ? null : 'AA:BB:CC:DD:EE:FF', status: ['ACTIVE', 'OFFLINE', 'SUSPENDED'][i % 3], created_at: '2026-11-08T09:00:00' })),
    ...options,
  }
  if (state.token !== false) await page.addInitScript(value => sessionStorage.setItem('smartclass.accessToken', value), token)
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method(), params = Object.fromEntries(url.searchParams)
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers })
    const body = request.postDataJSON()
    state.calls.push({ method, path: url.pathname, params, body, authorization: request.headers().authorization })
    const reply = (status, data, message = 'Test response') => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status >= 200 && status < 300, message, data }) })
    if (url.pathname === '/api/auth/me') return reply(200, { id: 1, username: 'admin_current', role: state.role })
    const match = url.pathname.match(/^\/api\/(users|devices)(?:\/(.+))?$/)
    if (!match) return reply(404, null)
    const scope = match[1], id = match[2] ? decodeURIComponent(match[2]) : null, users = scope === 'users'
    const key = users ? 'id' : 'device_id', target = state[scope].find(row => String(row[key]) === id)
    if (method === 'GET' && !id) {
      if (state.listStatus !== 200) return reply(state.listStatus, null)
      let rows = state[scope].filter(row => users ? !params.username || row.username.includes(params.username)
        : (!params.roomId || row.room_id === Number(params.roomId)) && (!params.type || row.type === params.type) && (!params.status || row.status === params.status))
      rows = rows.toSorted((a, b) => users ? a.id - b.id : a.device_id.localeCompare(b.device_id))
      const page = Number(params.page || 0), size = Number(params.size || 20)
      return reply(200, { content: rows.slice(page * size, (page + 1) * size), page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) })
    }
    if (method === 'GET') return state.detailStatus !== 200 ? reply(state.detailStatus, null) : target ? reply(200, target) : reply(404, null)
    if (state.writeWait) await state.writeWait
    if (state.writeNetwork) return route.abort('failed')
    if (state.writeError) return reply(state.writeError.status, null, state.writeError.message)
    if (method === 'POST') {
      const duplicate = state[scope].some(row => String(row[users ? 'username' : 'device_id']).toLowerCase() === String(body[users ? 'username' : 'deviceId']).toLowerCase())
      if (duplicate) return reply(409, null, users ? 'Username already exists' : 'Device already exists')
      const row = users ? { id: Math.max(...state.users.map(row => row.id)) + 1, username: body.username, role: body.role, created_at: '2026-11-08T10:00:00' }
        : { device_id: body.deviceId, room_id: body.roomId, type: body.type, mac_address: body.macAddress, status: body.status, created_at: '2026-11-08T10:00:00' }
      state[scope].push(row)
      return reply(201, row)
    }
    if (!target) return reply(404, null)
    if (method === 'PUT') {
      if (users && target.role === 'ADMIN' && body.role !== 'ADMIN' && state.users.filter(user => user.role === 'ADMIN').length <= 1) return reply(409, null, 'Cannot demote the last ADMIN')
      if (users) Object.assign(target, { username: body.username, role: body.role })
      else Object.assign(target, { room_id: body.roomId, type: body.type, status: body.status, mac_address: body.macAddress })
      if (users && target.id === 1) state.role = body.role
      return reply(200, target)
    }
    if (method === 'DELETE') {
      if (users && target.id === 1) return reply(409, null, 'Cannot delete the current account')
      if (!users && id === state.referenceDevice) return reply(409, null, 'Data conflicts with an existing record or reference')
      state[scope] = state[scope].filter(row => row !== target)
      return reply(200, null)
    }
    return reply(405, null)
  })
  return state
}
async function ready(page) {
  await page.goto('/admin')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(20)
}
test.beforeEach(async ({ page }) => { page.runtimeErrors = []; page.on('pageerror', error => page.runtimeErrors.push(error.message)) })
test.afterEach(async ({ page }) => { expect(page.runtimeErrors).toEqual([]) })

for (const role of ['TEACHER', 'STUDENT']) test(`backend identity excludes ${role} from admin even with ADMIN JWT claim`, async ({ page }) => {
  const state = await setup(page, { role })
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible()
  expect(calls(state, 'GET', '/api/users')).toHaveLength(0)
  expect(calls(state, 'GET', '/api/devices')).toHaveLength(0)
})

test('anonymous admin access redirects to login', async ({ page }) => {
  await setup(page, { token: false })
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
})

test('user CRUD loads detail, omits unchanged password, confirms deletion and prevents double submit', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await expect(page.getByRole('button', { name: 'Xóa admin_current', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Thêm tài khoản', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Username', { exact: true }).fill('ui_teacher')
  await modal.getByLabel('Mật khẩu', { exact: true }).fill('FixturePassword@123')
  await modal.getByLabel('Role', { exact: true }).selectOption('TEACHER')
  let release
  state.writeWait = new Promise(resolve => { release = resolve })
  await modal.getByRole('button', { name: 'Tạo mới', exact: true }).click()
  await expect(modal.getByRole('button', { name: 'Đang lưu…' })).toBeDisabled()
  await expect(modal.getByRole('button', { name: 'Đóng hộp thoại' })).toBeDisabled()
  await expect.poll(() => calls(state, 'POST', '/api/users').length).toBe(1)
  state.writeWait = null; release()
  await expect(modal).toHaveCount(0)
  await page.getByLabel('Tìm username').fill('ui_teacher')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
  const created = state.users.find(user => user.username === 'ui_teacher')
  await page.getByRole('button', { name: 'Sửa ui_teacher', exact: true }).click()
  await expect(modal.getByLabel('Username', { exact: true })).toHaveValue('ui_teacher')
  expect(calls(state, 'GET', `/api/users/${created.id}`)).toHaveLength(1)
  await modal.getByLabel('Role', { exact: true }).selectOption('STUDENT')
  await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(modal).toHaveCount(0)
  expect(calls(state, 'PUT', `/api/users/${created.id}`).at(-1).body).toEqual({ username: 'ui_teacher', role: 'STUDENT' })
  await expect(page.getByRole('button', { name: 'Sửa ui_teacher', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Sửa ui_teacher', exact: true }).click()
  await modal.getByLabel('Mật khẩu mới (không bắt buộc)').fill('ChangedPassword@123')
  await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(modal).toHaveCount(0)
  expect(calls(state, 'PUT', `/api/users/${created.id}`).at(-1).body.password).toBe('ChangedPassword@123')
  await expect(page.getByRole('button', { name: 'Xóa ui_teacher', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Xóa ui_teacher', exact: true }).click()
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click()
  expect(calls(state, 'DELETE', `/api/users/${created.id}`)).toHaveLength(0)
  await page.getByRole('button', { name: 'Xóa ui_teacher', exact: true }).click()
  await modal.getByRole('button', { name: 'Xác nhận xóa' }).click()
  await expect(modal).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Không có bản ghi phù hợp' })).toBeVisible()
  expect(calls(state, 'DELETE', `/api/users/${created.id}`)).toHaveLength(1)
  expect(await page.locator('body').innerText()).not.toContain('password_hash')
})

test('user validation, duplicate usernames and last-admin errors remain explicit', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.getByRole('button', { name: 'Thêm tài khoản', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: 'Tạo mới' }).click()
  await expect(modal.getByRole('alert')).toHaveCount(2)
  await modal.getByLabel('Username', { exact: true }).fill('new_user')
  await modal.getByLabel('Mật khẩu', { exact: true }).fill('\u00e9'.repeat(37))
  await modal.getByRole('button', { name: 'Tạo mới' }).click()
  await expect(modal.getByRole('alert')).toContainText('72 byte UTF-8')
  expect(calls(state, 'POST', '/api/users')).toHaveLength(0)
  await modal.getByLabel('Username', { exact: true }).fill('admin_current')
  await modal.getByLabel('Mật khẩu', { exact: true }).fill('FixturePassword@123')
  await modal.getByRole('button', { name: 'Tạo mới' }).click()
  await expect(modal.getByRole('alert')).toContainText('Tên đăng nhập đã tồn tại')
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.getByRole('button', { name: 'Sửa admin_current', exact: true }).click()
  await modal.getByLabel('Role', { exact: true }).selectOption('TEACHER')
  await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(modal.getByRole('alert')).toContainText('ADMIN cuối cùng')
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
})

test('device CRUD maps statuses, keeps ID immutable and clears optional MAC intentionally', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.getByRole('tab', { name: 'Thiết bị', exact: true }).click()
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(20)
  await page.getByRole('button', { name: 'Thêm thiết bị', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Device ID', { exact: true }).fill('aaa_sensor')
  await modal.getByLabel('Room ID', { exact: true }).fill('701')
  await modal.getByLabel('MAC Address (không bắt buộc)').fill('AA:BB:CC:DD:EE:FF')
  await modal.getByLabel('Status', { exact: true }).selectOption('OFFLINE')
  await modal.getByRole('button', { name: 'Tạo mới', exact: true }).click()
  await expect(modal).toHaveCount(0)
  expect(calls(state, 'POST', '/api/devices').at(-1).body).toEqual({ deviceId: 'aaa_sensor', roomId: 701, type: 'SENSOR', macAddress: 'AA:BB:CC:DD:EE:FF', status: 'OFFLINE' })
  await expect(page.getByRole('button', { name: 'Sửa aaa_sensor', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Sửa aaa_sensor', exact: true }).click()
  await expect(modal.getByLabel('Device ID', { exact: true })).toBeDisabled()
  await modal.getByLabel('Room ID', { exact: true }).fill('702')
  await modal.getByLabel('Type', { exact: true }).selectOption('ACTUATOR')
  await modal.getByLabel('Status', { exact: true }).selectOption('SUSPENDED')
  await modal.getByLabel('MAC Address (không bắt buộc)').fill('')
  await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(modal).toHaveCount(0)
  expect(calls(state, 'PUT', '/api/devices/aaa_sensor').at(-1).body).toEqual({ roomId: 702, type: 'ACTUATOR', macAddress: null, status: 'SUSPENDED' })
  await expect(page.locator('.admin-table tbody tr').filter({ hasText: 'aaa_sensor' })).toContainText('Suspended')
  await page.getByRole('button', { name: 'Xóa aaa_sensor', exact: true }).click()
  await modal.getByRole('button', { name: 'Xác nhận xóa' }).click()
  await expect(modal).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sửa aaa_sensor', exact: true })).toHaveCount(0)
})

test('device validation, duplicates and FK conflicts never discard history silently', async ({ page }) => {
  const state = await setup(page, { referenceDevice: 'device_01' })
  await ready(page)
  await page.getByRole('tab', { name: 'Thiết bị', exact: true }).click()
  await page.getByRole('button', { name: 'Thêm thiết bị', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Device ID', { exact: true }).fill('bad id')
  await modal.getByLabel('Room ID', { exact: true }).fill('0')
  await modal.getByLabel('MAC Address (không bắt buộc)').fill('invalid')
  await modal.getByRole('button', { name: 'Tạo mới' }).click()
  await expect(modal.getByRole('alert')).toHaveCount(3)
  expect(calls(state, 'POST', '/api/devices')).toHaveLength(0)
  await modal.getByLabel('Device ID', { exact: true }).fill('device_01')
  await modal.getByLabel('Room ID', { exact: true }).fill('101')
  await modal.getByLabel('MAC Address (không bắt buộc)').fill('')
  await modal.getByRole('button', { name: 'Tạo mới' }).click()
  await expect(modal.getByRole('alert')).toContainText('Device ID đã tồn tại')
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.getByRole('button', { name: 'Xóa device_01', exact: true }).click()
  await modal.getByRole('button', { name: 'Xác nhận xóa' }).click()
  await expect(modal.getByRole('alert')).toContainText('lịch sử cảm biến hoặc điều khiển')
  expect(state.devices.some(row => row.device_id === 'device_01')).toBe(true)
})

test('user pagination/search and device filters reset pages and use exact backend params', async ({ page }) => {
  const state = await setup(page)
  await ready(page)
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(3)
  await page.getByLabel('Tìm username').fill('member_02')
  await expect(page.locator('.admin-table tbody tr').filter({ hasText: 'member_02' })).toHaveCount(1)
  expect(calls(state, 'GET', '/api/users').at(-1).params).toEqual({ page: '0', size: '20', username: 'member_02' })
  await page.getByRole('tab', { name: 'Thiết bị', exact: true }).click()
  await page.getByLabel('Lọc Room ID').fill('101')
  await page.getByLabel('Lọc Type').selectOption('SENSOR')
  await page.getByLabel('Lọc Status').selectOption('ACTIVE')
  await expect.poll(() => calls(state, 'GET', '/api/devices').at(-1).params.status).toBe('ACTIVE')
  expect(calls(state, 'GET', '/api/devices').at(-1).params).toEqual({ page: '0', size: '20', roomId: '101', type: 'SENSOR', status: 'ACTIVE' })
  await page.getByLabel('Lọc Room ID').fill('0')
  await expect(page.getByRole('alert')).toContainText('Room ID phải là số nguyên dương')
  await expect(page.getByRole('button', { name: 'Làm mới', exact: true })).toBeDisabled()
})

test('list, detail, network mutation and expired JWT errors are recoverable without retries', async ({ page }) => {
  const state = await setup(page, { listStatus: 500 })
  await page.goto('/admin')
  await expect(page.getByRole('alert')).toContainText('Chưa tải được dữ liệu')
  state.listStatus = 200
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(20)
  state.detailStatus = 404
  await page.getByRole('button', { name: 'Sửa member_02', exact: true }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('alert')).toContainText('Bản ghi không còn tồn tại')
  state.detailStatus = 200
  await modal.getByRole('button', { name: 'Tải lại chi tiết' }).click()
  await expect(modal.getByLabel('Username', { exact: true })).toHaveValue('member_02')
  state.writeNetwork = true
  await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(modal.getByRole('alert')).toContainText('Chưa xác định thao tác đã được lưu hay chưa')
  expect(calls(state, 'PUT', '/api/users/2')).toHaveLength(1)
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click()
  state.listStatus = 401
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('modal 403 preserves session; role refresh enforces actual authority', async ({ page }) => {
  const state = await setup(page, { writeError: { status: 403, message: 'Forbidden' } })
  await ready(page)
  await page.getByRole('button', { name: 'Sửa member_02', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Username', { exact: true }).fill('member_02')
  await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(modal.getByRole('alert')).toContainText('không có quyền')
  expect(await page.evaluate(() => sessionStorage.getItem('smartclass.accessToken'))).not.toBeNull()
  await modal.getByRole('button', { name: 'Hủy', exact: true }).click()
  state.role = 'STUDENT'; state.listStatus = 403
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Thêm tài khoản', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Kiểm tra lại quyền' }).click()
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible()
})

test('desktop and mobile tables and modal fit with focus and Escape support', async ({ page }) => {
  await setup(page)
  await ready(page)
  await page.screenshot({ path: 'test-results/admin-users-desktop.png', fullPage: true })
  await page.getByRole('tab', { name: 'Thiết bị', exact: true }).click()
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(20)
  await page.screenshot({ path: 'test-results/admin-devices-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.locator('.admin-table-scroll').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'Thêm thiết bị', exact: true }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByLabel('Device ID', { exact: true })).toBeFocused()
  expect(await modal.evaluate(element => element.getBoundingClientRect().width <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/admin-modal-mobile.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
})

test('editing own role revalidates auth immediately and removes admin access', async ({ page }) => {
  const state = await setup(page)
  state.users[1].role = 'ADMIN'
  await ready(page)
  await page.getByRole('button', { name: 'Sửa admin_current', exact: true }).click()
  const modal = page.getByRole('dialog')
  await modal.getByLabel('Role', { exact: true }).selectOption('TEACHER')
  await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible()
  expect(state.role).toBe('TEACHER')
})

test('real Spring Boot user/device CRUD uses only an explicitly isolated existing test database', async ({ page, request }) => {
  test.skip(process.env.SMARTCLASS_E2E_ADMIN_CRUD !== '1', 'Enable only with an isolated backend database and environment credentials')
  test.setTimeout(60000)
  if (!/^smartclass_verify_[a-zA-Z0-9_]+_admin$/.test(process.env.SMARTCLASS_TEST_DATABASE || '')) throw new Error('An isolated smartclass_verify_*_admin database is required')
  const username = process.env.AUTH_ADMIN_USERNAME, password = process.env.AUTH_ADMIN_PASSWORD
  if (!username || !password) throw new Error('Set ADMIN test credentials in the environment')
  const prefix = `ui_admin_${randomBytes(6).toString('hex')}`, userPassword = `${randomBytes(15).toString('base64url')}Aa1!`
  let createdUserId, createdDeviceId, accessToken
  await page.goto('/login')
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  accessToken = await page.evaluate(() => sessionStorage.getItem('smartclass.accessToken'))
  const authHeaders = { Authorization: `Bearer ${accessToken}` }
  try {
    await page.getByRole('link', { name: 'Quản trị', exact: true }).click()
    await page.getByLabel('Tìm username').fill(prefix)
    await expect(page.getByRole('heading', { name: 'Không có bản ghi phù hợp' })).toBeVisible()
    await page.getByRole('button', { name: 'Thêm tài khoản', exact: true }).click()
    const modal = page.getByRole('dialog')
    await modal.getByLabel('Username', { exact: true }).fill(prefix)
    await modal.getByLabel('Mật khẩu', { exact: true }).fill(userPassword)
    await modal.getByLabel('Role', { exact: true }).selectOption('TEACHER')
    const created = page.waitForResponse(response => response.url().endsWith('/api/users') && response.request().method() === 'POST')
    await modal.getByRole('button', { name: 'Tạo mới', exact: true }).click()
    const createdResponse = await created
    expect(createdResponse.status()).toBe(201)
    createdUserId = (await createdResponse.json()).data.id
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Sửa ${prefix}`, exact: true })).toBeEnabled()
    await page.getByRole('button', { name: `Sửa ${prefix}`, exact: true }).click()
    await modal.getByLabel('Role', { exact: true }).selectOption('STUDENT')
    const updated = page.waitForResponse(response => response.url().endsWith(`/api/users/${createdUserId}`) && response.request().method() === 'PUT')
    await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
    const updatedResponse = await updated
    expect(updatedResponse.status()).toBe(200)
    expect(updatedResponse.request().postDataJSON()).not.toHaveProperty('password')
    const login = await request.post('http://localhost:8080/api/auth/login', { data: { username: prefix, password: userPassword } })
    expect(login.status()).toBe(200)
    expect((await login.json()).data.user.role).toBe('STUDENT')
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Xóa ${prefix}`, exact: true })).toBeEnabled()
    await page.getByRole('button', { name: `Xóa ${prefix}`, exact: true }).click()
    await modal.getByRole('button', { name: 'Xác nhận xóa' }).click()
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Không có bản ghi phù hợp' })).toBeVisible()
    createdUserId = null

    await page.getByRole('tab', { name: 'Thiết bị', exact: true }).click()
    await page.getByLabel('Lọc Room ID').fill('19876')
    await expect(page.getByRole('heading', { name: 'Không có bản ghi phù hợp' })).toBeVisible()
    await page.getByRole('button', { name: 'Thêm thiết bị', exact: true }).click()
    await modal.getByLabel('Device ID', { exact: true }).fill(prefix)
    await modal.getByLabel('Room ID', { exact: true }).fill('19876')
    await modal.getByLabel('Status', { exact: true }).selectOption('OFFLINE')
    const deviceCreated = page.waitForResponse(response => response.url().endsWith('/api/devices') && response.request().method() === 'POST')
    await modal.getByRole('button', { name: 'Tạo mới', exact: true }).click()
    const deviceCreatedResponse = await deviceCreated
    expect(deviceCreatedResponse.status()).toBe(201)
    createdDeviceId = (await deviceCreatedResponse.json()).data.device_id
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Sửa ${prefix}`, exact: true })).toBeEnabled()
    await page.getByRole('button', { name: `Sửa ${prefix}`, exact: true }).click()
    await expect(modal.getByLabel('Device ID', { exact: true })).toBeDisabled()
    await modal.getByLabel('Status', { exact: true }).selectOption('SUSPENDED')
    await modal.getByLabel('Type', { exact: true }).selectOption('ACTUATOR')
    const deviceUpdated = page.waitForResponse(response => response.url().endsWith(`/api/devices/${prefix}`) && response.request().method() === 'PUT')
    await modal.getByRole('button', { name: 'Lưu thay đổi' }).click()
    const deviceUpdatedResponse = await deviceUpdated
    expect(deviceUpdatedResponse.status()).toBe(200)
    expect(deviceUpdatedResponse.request().postDataJSON()).not.toHaveProperty('deviceId')
    expect((await deviceUpdatedResponse.json()).data.status).toBe('SUSPENDED')
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('button', { name: `Xóa ${prefix}`, exact: true })).toBeEnabled()
    await page.getByRole('button', { name: `Xóa ${prefix}`, exact: true }).click()
    await modal.getByRole('button', { name: 'Xác nhận xóa' }).click()
    await expect(modal).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Không có bản ghi phù hợp' })).toBeVisible()
    createdDeviceId = null
  } finally {
    // Only this test's randomly named records are eligible for cleanup.
    if (createdUserId) await request.delete(`http://localhost:8080/api/users/${createdUserId}`, { headers: authHeaders })
    if (createdDeviceId === prefix) await request.delete(`http://localhost:8080/api/devices/${encodeURIComponent(prefix)}`, { headers: authHeaders })
  }
})
