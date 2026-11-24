import { test, expect } from '@playwright/test'

const storageKey = 'smartclass.accessToken'
const frontendOrigin = `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`
const runtimeErrors = new WeakMap()
test.beforeEach(async ({ page }) => {
  const errors = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]) })

function fixtureToken(role = 'TEACHER', lifetime = 3600) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ sub: 'fixture_user', userId: 81, role, exp: Math.floor(Date.now() / 1000) + lifetime })}.test-only-signature`
}

async function mockAuth(page, overrides = {}) {
  const state = { role: 'TEACHER', loginStatus: 200, meStatus: 200, calls: [], token: fixtureToken(), ...overrides }
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    state.calls.push({ path, method: request.method(), authorization: request.headers().authorization })
    const headers = { 'Access-Control-Allow-Origin': frontendOrigin, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers })
    let status = 200
    let data = null
    if (path === '/api/auth/login') {
      status = state.loginStatus
      data = { accessToken: state.token, tokenType: 'Bearer', expiresIn: 3600, user: { id: 81, username: 'fixture_user', role: 'ADMIN' } }
    } else if (path === '/api/auth/me') {
      if (state.meWait) await state.meWait
      status = state.meStatus
      data = { id: 81, username: 'fixture_user', role: state.role }
    }
    await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ success: status === 200, message: status === 200 ? 'Success' : 'Unauthorized', data: status === 200 ? data : null }) })
  })
  return state
}
async function fillLogin(page, password = 'fixture-password') {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('fixture_user')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
}
async function login(page) {
  await fillLogin(page)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

test('protected routes redirect; form validates and password visibility is accessible', async ({ page }) => {
  const state = await mockAuth(page)
  await page.goto('/history')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByText('Vui lòng nhập tên đăng nhập.')).toBeVisible()
  await expect(page.getByText('Vui lòng nhập mật khẩu.')).toBeVisible()
  await expect(page.getByLabel('Tên đăng nhập', { exact: true })).toBeFocused()
  expect(state.calls.filter(call => call.method === 'POST')).toHaveLength(0)
  await fillLogin(page, '\u00e9'.repeat(37))
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByText('Mật khẩu không được vượt quá 72 byte UTF-8.')).toBeVisible()
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click()
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click()
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('type', 'password')
})

test('bad credentials show an error without creating a session', async ({ page }) => {
  const state = await mockAuth(page, { loginStatus: 401 })
  await page.goto('/login')
  await login(page)
  await expect(page.getByRole('alert')).toHaveText('Tên đăng nhập hoặc mật khẩu không đúng.')
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull()
  expect(state.calls.find(call => call.method === 'POST').authorization).toBeUndefined()
})

test('reload and return path work; role comes from me rather than login or JWT', async ({ page }) => {
  const state = await mockAuth(page, { token: fixtureToken('ADMIN') })
  await page.goto('/history')
  await login(page)
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.getByRole('heading', { name: 'Lịch sử', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0)
  expect(state.calls.filter(call => call.path === '/api/auth/me' && call.method === 'GET').every(call => call.authorization === `Bearer ${state.token}`)).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lịch sử', exact: true })).toBeVisible()
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible()
  state.role = 'ADMIN'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Quản trị', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toBeVisible()
})

test('logout removes stored credentials and browser back cannot reopen protected pages', async ({ page }) => {
  await mockAuth(page, { role: 'ADMIN' })
  await page.goto('/admin')
  await login(page)
  await expect(page.getByRole('heading', { name: 'Quản trị', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Lịch sử', exact: true }).click()
  await expect(page).toHaveURL(/\/history$/)
  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull()
  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Đăng nhập SmartClass' })).toBeVisible()
})

for (const badToken of ['broken-token', fixtureToken('TEACHER', -10)]) {
  test(`invalid stored token is removed before restoring a session: ${badToken === 'broken-token' ? 'malformed' : 'expired'}`, async ({ page }) => {
    const state = await mockAuth(page)
    await page.addInitScript(({ key, token }) => sessionStorage.setItem(key, token), { key: storageKey, token: badToken })
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText(/Phiên đăng nhập đã hết hạn/)).toBeVisible()
    expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull()
    expect(state.calls.filter(call => call.path === '/api/auth/me')).toHaveLength(0)
  })
}

test('server 401 invalidates the session; server 500 keeps the token and supports retry', async ({ page }) => {
  const state = await mockAuth(page)
  await page.goto('/login')
  await login(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  state.meStatus = 500
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Chưa thể xác minh phiên đăng nhập' })).toBeVisible()
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBe(state.token)
  state.meStatus = 200
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible({ timeout: 15000 })
  state.meStatus = 401
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull()
})

test('expiry timer logs out without waiting for a request', async ({ page }) => {
  await page.clock.install()
  await mockAuth(page, { token: fixtureToken('TEACHER', 30) })
  await page.goto('/login')
  await login(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.clock.fastForward(31000)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText(/Phiên đăng nhập đã hết hạn/)).toBeVisible()
})

test('logout wins over an in-flight identity refresh', async ({ page }) => {
  const state = await mockAuth(page)
  await page.goto('/login')
  await login(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  let release
  state.meWait = new Promise(resolve => { release = resolve })
  const started = page.waitForRequest(request => request.url().endsWith('/api/auth/me'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await started
  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  release()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull()
})

test('API client adds JWT, handles generic 401 and refuses cross-origin destinations', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/login')
  await login(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const headerRequest = page.waitForRequest(request => request.url().endsWith('/api/telemetry') && request.method() === 'GET')
  await page.evaluate(async () => { const { api } = await import('/src/services/api/client.js'); await api.get('/api/telemetry') })
  const request = await headerRequest
  expect(request.headers().authorization).toMatch(/^Bearer /)
  const blocked = await page.evaluate(async () => {
    const { api } = await import('/src/services/api/client.js')
    try { await api.get('https://example.invalid/api') } catch { return true }
    return false
  })
  expect(blocked).toBe(true)
  await page.route('http://localhost:8080/api/telemetry', route => route.fulfill({ status: 401, headers: { 'Access-Control-Allow-Origin': frontendOrigin }, contentType: 'application/json', body: '{"success":false,"data":null}' }))
  await page.evaluate(async () => { const { api } = await import('/src/services/api/client.js'); await api.get('/api/telemetry').catch(() => {}) })
  await expect(page).toHaveURL(/\/login$/)
})

test('mobile login remains usable without horizontal overflow', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/login')
  await page.screenshot({ path: 'test-results/login-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Đăng nhập SmartClass' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true })
})

test.describe('Spring Boot integration', () => {
  test.skip(process.env.SMARTCLASS_E2E_BACKEND !== '1', 'Enable explicitly with test credentials in environment variables')
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT']) {
    test(`real login, CORS, reload and logout: ${role}`, async ({ page }) => {
      const username = process.env[`AUTH_${role}_USERNAME`]
      const password = process.env[`AUTH_${role}_PASSWORD`]
      if (!username || !password) throw new Error(`Set test credentials for ${role} in the environment`)
      await page.goto('/login')
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username)
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
      const responsePromise = page.waitForResponse(response => response.url() === 'http://localhost:8080/api/auth/login' && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      const response = await responsePromise
      expect(response.status()).toBe(200)
      expect(response.headers()['access-control-allow-origin']).toBe(frontendOrigin)
      await expect(page).toHaveURL(/\/dashboard$/)
      const homeHeading = page.getByRole('heading', { name: 'Tổng quan', exact: true })
      await expect(homeHeading).toBeVisible()
      await page.reload()
      await expect(homeHeading).toBeVisible()
      await page.goto('/admin')
      await expect(page.getByRole('heading', { name: role === 'ADMIN' ? 'Quản trị' : 'Bạn không có quyền truy cập', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Đăng xuất' }).click()
      await expect(page).toHaveURL(/\/login$/)
      expect(await page.evaluate(key => sessionStorage.getItem(key), storageKey)).toBeNull()
    })
  }
})
