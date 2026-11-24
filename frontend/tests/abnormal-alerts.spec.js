import { test, expect } from '@playwright/test'

async function setup(page, role = 'TEACHER') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'alerts_fixture', userId: 81, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only`
  await page.addInitScript(value => sessionStorage.setItem('smartclass.accessToken', value), token)
  const state = { mode: 'hot', fail: false, reads: 0, writes: 0 }
  function report() {
    const unknown = state.mode === 'unknown', cool = state.mode === 'cool'
    const statuses = unknown ? ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'] : cool ? ['NORMAL', 'ALERT', 'ALERT', 'NORMAL'] : state.mode === 'clear' ? ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL'] : ['ALERT', 'NORMAL', 'NORMAL', 'ALERT']
    const temperature = unknown ? null : cool ? 27 : 32, light = unknown ? null : cool ? 100 : 300
    const fanOn = unknown ? null : cool, lightOn = unknown ? null : !cool
    const definitions = [
      ['HOT_FAN_OFF', 'Nóng nhưng quạt chưa bật', temperature, '°C', 30, fanOn, 'Cân nhắc bật quạt.'],
      ['COOL_FAN_ON', 'Nhiệt độ thấp nhưng quạt vẫn bật', temperature, '°C', 28, fanOn, 'Cân nhắc tắt quạt.'],
      ['DARK_LIGHT_OFF', 'Thiếu sáng nhưng đèn chưa bật', light, 'lux', 150, lightOn, 'Nếu phòng đang được sử dụng, cân nhắc bật đèn.'],
      ['BRIGHT_LIGHT_ON', 'Đủ sáng nhưng đèn vẫn bật', light, 'lux', 250, lightOn, 'Cân nhắc tắt đèn.'],
    ]
    return { roomId: 101, checkedAt: new Date().toISOString(), sensorReady: !unknown, actuatorReady: !unknown, synchronizedReadings: !unknown, temperature, light, fanOn, lightOn, estimatedLight: true,
      rules: definitions.map(([code, title, value, unit, threshold, deviceOn, recommendation], i) => ({ code, title, value, unit, threshold, deviceOn, recommendation, status: statuses[i], message: statuses[i] === 'UNKNOWN' ? 'Chưa đủ dữ liệu.' : statuses[i] === 'ALERT' ? title : 'Không có dấu hiệu bất thường theo quy tắc này.' })) }
  }
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: {
      'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`,
      'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,OPTIONS',
    }, body: JSON.stringify({ success: status === 200, data, message: status === 200 ? 'Thành công' : 'Chưa đọc được cảm biến và trạng thái thiết bị.' }) })
    if (request.method() === 'OPTIONS') return reply(null)
    if (request.method() !== 'GET') state.writes++
    if (path === '/api/auth/me') return reply({ id: 81, username: 'alerts_fixture', role })
    if (path === '/api/notifications/unread-count') return reply({ count: 0 })
    if (path === '/api/rooms/101/abnormal-alerts') { state.reads++; return reply(state.fail ? null : report(), state.fail ? 503 : 200) }
    return reply(null, 404)
  })
  return state
}

test('teacher sees hot fan-off and bright light-on alerts through menu without control commands', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/abnormal-alerts')
  await expect(page.getByRole('link', { name: 'Cảnh báo bất thường', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '2 cảnh báo cần kiểm tra' })).toBeVisible()
  await expect(page.locator('.abnormal-rule.alert')).toHaveCount(2)
  await expect(page.locator('.abnormal-rule.alert')).toContainText(['Nóng nhưng quạt chưa bật', 'Đủ sáng nhưng đèn vẫn bật'])
  await expect(page.getByRole('link', { name: 'Mở điều khiển thiết bị' })).toHaveAttribute('href', '/iot/rooms/101')
  await expect(page.getByText('Ánh sáng quy đổi', { exact: true })).toBeVisible()
  expect(state.writes).toBe(0)
  if (process.env.SMARTCLASS_CAPTURE_ALERTS === '1') await page.screenshot({ path: '../.runtime/abnormal-alert-desktop-fixture.png', fullPage: true })
})

test('admin sees cool fan-on and dark light-off warnings on mobile', async ({ page }) => {
  const state = await setup(page, 'ADMIN'); state.mode = 'cool'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/abnormal-alerts')
  await expect(page.locator('.abnormal-rule.alert')).toHaveCount(2)
  await expect(page.locator('.abnormal-rule.alert')).toContainText(['Nhiệt độ thấp nhưng quạt vẫn bật', 'Thiếu sáng nhưng đèn chưa bật'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (process.env.SMARTCLASS_CAPTURE_ALERTS === '1') await page.screenshot({ path: '../.runtime/abnormal-alert-mobile-fixture.png', fullPage: true })
})

test('polling clears recovered warnings and never sends a device command', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/abnormal-alerts')
  await expect(page.getByRole('heading', { name: '2 cảnh báo cần kiểm tra' })).toBeVisible()
  state.mode = 'clear'
  await expect(page.getByRole('heading', { name: 'Chưa phát hiện bất thường' })).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.abnormal-rule.alert')).toHaveCount(0)
  expect(state.reads).toBeGreaterThan(1)
  expect(state.writes).toBe(0)
})

test('failed refresh removes obsolete results and missing data is not recovery', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/abnormal-alerts')
  await expect(page.locator('.abnormal-rule.alert')).toHaveCount(2)
  state.fail = true
  await page.getByRole('button', { name: 'Kiểm tra lại' }).click()
  await expect(page.getByRole('alert')).toContainText('Chưa đọc được cảm biến')
  await expect(page.locator('.abnormal-rule')).toHaveCount(0)
  state.fail = false; state.mode = 'unknown'
  await page.getByRole('button', { name: 'Kiểm tra lại' }).click()
  await expect(page.getByRole('heading', { name: 'Chưa đủ dữ liệu để kết luận' })).toBeVisible()
  await expect(page.locator('.abnormal-rule.unknown')).toHaveCount(4)
  await expect(page.getByRole('heading', { name: 'Chưa phát hiện bất thường' })).toHaveCount(0)
})

test('student has no menu link and cannot open abnormal alerts', async ({ page }) => {
  const state = await setup(page, 'STUDENT')
  await page.goto('/abnormal-alerts')
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cảnh báo bất thường', exact: true })).toHaveCount(0)
  expect(state.reads).toBe(0)
})
