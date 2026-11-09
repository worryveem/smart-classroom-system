import { test, expect } from '@playwright/test'

async function setup(page, role = 'TEACHER') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'ai_fixture', userId: 81, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only`
  await page.addInitScript(value => sessionStorage.setItem('smartclass.accessToken', value), token)
  const state = { enabled: false, fail: false, loadFail: false, writes: 0, canConfigure: true, values: { fan_on:30, fan_off:28, light_on:150, light_off:250, empty_seconds:300 } }
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: {
      'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`,
      'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    }, body: JSON.stringify({ success: status === 200, data, message: status === 200 ? 'Thành công' : 'Không thể lưu cấu hình' }) })
    if (request.method() === 'OPTIONS') return reply(null)
    if (path === '/api/auth/me') return reply({ id: 81, username: 'ai_fixture', role })
    if (path === '/api/notifications/unread-count') return reply({ count: 0 })
    if (path === '/api/automation') {
      if (request.method() === 'PUT') {
        state.writes++
        if (state.fail) return reply(null, 503)
        state.enabled = request.postDataJSON().enabled
        const b=request.postDataJSON()
        state.values={fan_on:b.fanOn,fan_off:b.fanOff,light_on:b.lightOn,light_off:b.lightOff,empty_seconds:b.emptySeconds}
      } else if (state.loadFail) return reply(null, 503)
      return reply({ enabled: state.enabled, ...state.values, canConfigure: state.canConfigure, permissionReason:'Bạn cần lịch đã duyệt đang trong giờ sử dụng', message:'Đang chờ kiểm tra cảm biến' })
    }
    return reply(null, 404)
  })
  return state
}

test('teacher saves enabled choice, reloads and disables it', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/automation')
  const toggle = page.getByRole('switch', { name: 'Tự động bật/tắt quạt và đèn' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Đang chờ kiểm tra cảm biến', { exact: true })).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.focus(); await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(state.writes).toBe(2)
})

test('failed save preserves state and can be retried', async ({ page }) => {
  const state = await setup(page, 'ADMIN')
  await page.goto('/automation')
  const toggle = page.getByRole('switch')
  await expect(toggle).toBeEnabled()
  state.fail = true
  await toggle.click()
  await expect(page.getByRole('alert')).toContainText('Không thể lưu cấu hình')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  state.fail = false
  await page.getByRole('button',{name:'Thử lại'}).click()
  await expect(toggle).toBeEnabled()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
})

test('load failure disables switch and retry restores page on mobile', async ({ page }) => {
  const state = await setup(page)
  state.loadFail = true
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/automation')
  await expect(page.getByRole('switch')).toBeDisabled()
  state.loadFail = false
  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByRole('switch')).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('student cannot access automation or see navigation entry', async ({ page }) => {
  await setup(page, 'STUDENT')
  await page.goto('/automation')
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Chế độ tự động' })).toHaveCount(0)
})

test('thresholds persist and invalid hysteresis never sends a request', async ({page}) => {
  const state=await setup(page,'ADMIN')
  await page.goto('/automation')
  await page.getByLabel('Bật quạt từ (°C)',{exact:true}).fill('27')
  await page.getByRole('button',{name:'Lưu ngưỡng điều khiển'}).click()
  await expect(page.getByRole('alert')).toContainText('Ngưỡng tắt quạt phải nhỏ hơn')
  expect(state.writes).toBe(0)
  await page.getByLabel('Bật quạt từ (°C)',{exact:true}).fill('32')
  await page.getByRole('button',{name:'Lưu ngưỡng điều khiển'}).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Bật quạt từ (°C)',{exact:true})).toHaveValue('32')
})

test('teacher outside approved booking can read but cannot change mode',async({page})=>{
  const state=await setup(page);state.canConfigure=false
  await page.goto('/automation')
  await expect(page.getByRole('alert')).toContainText('lịch đã duyệt')
  await expect(page.getByRole('switch')).toBeDisabled()
  expect(state.writes).toBe(0)
})

test('can switch off despite an unfinished invalid threshold edit',async({page})=>{
  const state=await setup(page,'ADMIN');state.enabled=true
  await page.goto('/automation')
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','true')
  await page.getByLabel('Bật quạt từ (°C)',{exact:true}).fill('')
  await page.getByRole('switch').click()
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','false')
  expect(state.values.fan_on).toBe(30)
})
