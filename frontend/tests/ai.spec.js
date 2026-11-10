import { test, expect } from '@playwright/test'

async function setup(page, role = 'TEACHER') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'ai_fixture', userId: 81, role, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-only`
  await page.addInitScript(value => sessionStorage.setItem('smartclass.accessToken', value), token)
  const state = { ready: true, fail: false, historyFail: false, writes: 0, rows: [], payload: null, motion: true, label: 'ANOMALY', observations: [], observed: null, demoFail: false, demoPayload: null, liveReady: false, liveCalls: 0 }
  await page.route('http://localhost:8080/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: {
      'Access-Control-Allow-Origin': `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`,
      'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }, body: JSON.stringify({ success: status === 200, data, message: status === 200 ? 'Thành công' : 'Mẫu cảm biến đã quá 60 giây; hãy lấy mẫu mới.' }) })
    if (request.method() === 'OPTIONS') return reply(null)
    if (path === '/api/auth/me') return reply({ id: 81, username: 'ai_fixture', role })
    if (path === '/api/notifications/unread-count') return reply({ count: 0 })
    if (path.endsWith('/occupancy-live')) {
      state.liveCalls++
      return reply({ sampledAt: '2026-11-10T10:00:00Z', prediction: { label: 'CROWDED', data_source: 'CURRENT_SENSOR', features: { temp_mean: 29.5, light_mean: 400, pir_active: 1, hour: 17 }, estimated_light: true, out_of_training_range: true, notices: [] } }, state.fail ? 409 : 200)
    }
    if (path.endsWith('/occupancy-demo')) {
      state.demoPayload = request.postDataJSON()
      return reply({ label: state.demoPayload.sampleLabel, data_source: 'SAMPLE_DATASET', sample: { temp_mean: 25, light_mean: 62, pir_active: 0, hour: 10 }, notice: 'Dữ liệu mẫu, không phản ánh phòng 101 hiện tại.' }, state.demoFail ? 503 : 200)
    }
    if (path.endsWith('/dataset')) return reply({ observations: state.observations, count: state.observations.length })
    if (/\/dataset\/\d+$/.test(path)) {
      state.observed = request.postDataJSON()
      state.observations = [{ historyId: state.rows[0].id, peopleCount: state.observed.peopleCount }]
      return reply(state.observations[0])
    }
    if (path.endsWith('/status')) return reply({ roomId: 101, service: { status: state.ready ? 'ready' : 'offline', models: { anomaly: state.ready, occupancy: state.ready } }, occupancyLiveReady: state.liveReady, occupancyNotice: 'Cần đúng quy trình xử lý ánh sáng.' })
    if (path.endsWith('/history')) return reply(state.rows, state.historyFail ? 503 : 200)
    if (path.endsWith('/analyze')) {
      state.writes++; state.payload = request.postDataJSON()
      if (state.fail) return reply(null, 409)
      const result = { roomId: 101, sensorId: 'node1_sensor', analyzedAt: '2026-11-10T09:00:01Z', sampledAt: '2026-11-10T09:00:00Z',
        input: { temp: 29.5, humidity: 71, motion: state.motion, ldr_adc: 3916, threshold: state.payload.threshold, high_is_bright: state.payload.highIsBright },
        anomaly: { experimental: true, label: state.label, decision_score: -0.05, suggestion: 'Dữ liệu có dấu hiệu khác thường; nên kiểm tra điều kiện phòng và cảm biến.', notice: 'Kết quả thử nghiệm; điểm quyết định không phải xác suất sự cố.', light_conversion: { light: true } } }
      if (state.label === 'ANOMALY') result.anomaly.explanation = { method: 'single_feature_counterfactual', summary: 'Yếu tố làm model thay đổi đánh giá', items: [{ feature: 'motion', title: 'Chuyển động', detail: 'Đổi riêng có chuyển động thành không chuyển động: model không còn cảnh báo.', observed: true, reference: false, reference_label: 'NORMAL' }] }
      if (state.liveReady) result.occupancy = { label: 'CROWDED', notice: 'Dự đoán từ số đo cảm biến mới nhất.' }
      state.rows = [{ id: state.writes, result }, ...state.rows]
      return reply(result)
    }
    return reply(null, 404)
  })
  return state
}

test('teacher analyzes raw ADC and sees persisted personal history', async ({ page }) => {
  const state = await setup(page)
  if (process.env.SMARTCLASS_CAPTURE_AI === '1') state.liveReady = true
  await page.goto('/ai')
  await expect(page.getByText('Sẵn sàng phân tích', { exact: true })).toBeVisible()
  await page.getByText('Cài đặt ánh sáng', { exact: true }).click()
  await page.getByLabel('Ngưỡng ADC sáng/tối').fill('3950')
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.locator('.ai-result').getByRole('heading', { name: 'Cần kiểm tra', exact: true })).toBeVisible()
  await expect(page.locator('.ai-reason-box')).toContainText('model không còn cảnh báo')
  await expect(page.locator('.ai-history')).not.toHaveAttribute('open', '')
  expect(state.payload).toEqual({ threshold: 3950, highIsBright: false })
  expect(state.writes).toBe(1)
  await expect(page.locator('.ai-result dd').filter({ hasText: /^Sáng$/ })).toBeVisible()
  await expect(page.getByText('Điểm quyết định:', { exact: false })).not.toBeVisible()
  await page.getByText('Chi tiết phân tích', { exact: true }).click()
  await expect(page.getByText('Điểm quyết định:', { exact: false })).toBeVisible()
  if (process.env.SMARTCLASS_CAPTURE_AI === '1') {
    await page.getByText('Chi tiết phân tích', { exact: true }).click()
    await page.getByText('Cài đặt ánh sáng', { exact: true }).click()
    await page.getByRole('button', { name: 'Phân tích model 2', exact: true }).click()
    await expect(page.locator('.ai-demo-result h3')).toHaveText('Đông người')
    await page.evaluate(() => { window.scrollTo(0, 0); window.getSelection()?.removeAllRanges() })
    await page.screenshot({ path: '../.runtime/ai-refresh-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => { window.scrollTo(0, 0); window.getSelection()?.removeAllRanges() })
    await page.screenshot({ path: '../.runtime/ai-refresh-mobile.png', fullPage: true })
  }
  await page.reload()
  await page.getByText('Lịch sử phân tích', { exact: true }).click()
  await expect(page.locator('.ai-history-row strong')).toHaveText('Cần kiểm tra')
})

test('failed analysis clears old current result and allows retry', async ({ page }) => {
  const state = await setup(page, 'ADMIN')
  await page.goto('/ai')
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.locator('.ai-result')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Phân tích model 1' })).toBeEnabled()
  state.fail = true
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.getByRole('alert')).toContainText('quá 60 giây')
  await expect(page.locator('.ai-result')).toHaveCount(0)
  state.fail = false
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.locator('.ai-result')).toBeVisible()
})

test('offline service disables analysis and reload recovers on mobile', async ({ page }) => {
  const state = await setup(page); state.ready = false
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/ai')
  await expect(page.getByRole('button', { name: 'Phân tích model 1' })).toBeDisabled()
  state.ready = true
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Phân tích model 1' })).toBeEnabled()
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.locator('.ai-result')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('invalid threshold does not send request and ADC direction can be changed', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/ai')
  await expect(page.getByRole('button', { name: 'Phân tích model 1' })).toBeEnabled()
  await page.getByText('Cài đặt ánh sáng', { exact: true }).click()
  await page.getByLabel('Ngưỡng ADC sáng/tối').fill('4095')
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  expect(state.writes).toBe(0)
  await page.getByLabel('Ngưỡng ADC sáng/tối').fill('4000')
  await page.getByLabel('Chiều biến thiên ADC').selectOption('high')
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.locator('.ai-result')).toBeVisible()
  expect(state.payload.highIsBright).toBe(true)
})

test('history failure preserves successful result', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/ai')
  await expect(page.getByRole('button', { name: 'Phân tích model 1' })).toBeEnabled()
  state.historyFail = true
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.locator('.ai-result')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Đã phân tích và lưu kết quả')
})

test('student cannot access AI or see menu entry', async ({ page }) => {
  await setup(page, 'STUDENT')
  await page.goto('/ai')
  await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Gợi ý AI' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Phân tích model 1' })).toHaveCount(0)
})


test('simple analysis hides settings and explains no motion without claiming empty room', async ({ page }) => {
  const state = await setup(page); state.motion = false; state.label = 'NORMAL'
  await page.goto('/ai')
  await expect(page.getByLabel('Ngưỡng ADC sáng/tối')).not.toBeVisible()
  await page.getByRole('button', { name: 'Phân tích model 1' }).click()
  await expect(page.locator('.ai-result')).toContainText('Chưa thấy bất thường')
  await expect(page.locator('.ai-result')).toContainText('Chưa có chuyển động')
  await expect(page.locator('.ai-reason-box')).toHaveCount(0)
  await expect(page.locator('.ai-result')).not.toContainText('EMPTY')
  expect(state.payload).toEqual({ threshold: 4000, highIsBright: false })
})

test('occupancy refuses invented scenarios and predicts only from live analysis', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/ai')
  await expect(page.getByLabel('Số người bạn quan sát trong phòng')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Phân tích model 2', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Tình huống demo')).toHaveCount(0)
  state.liveReady = true
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Phân tích model 2', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Phân tích model 2', exact: true }).click()
  await expect(page.locator('.ai-demo-result').getByRole('heading', { name: 'Đông người', exact: true })).toBeVisible()
  await expect(page.locator('.ai-demo-result')).toContainText('Ánh sáng chưa hiệu chuẩn')
  await expect(page.locator('.ai-demo-result')).toContainText('Ngoài phạm vi đã học')
  await page.getByRole('button', { name: 'Phân tích model 2', exact: true }).click()
  await expect(page.locator('.ai-demo-result').getByRole('heading', { name: 'Đông người', exact: true })).toBeVisible()
  expect(state.demoPayload).toBeNull()
  expect(state.writes).toBe(0)
  expect(state.liveCalls).toBe(2)
  state.fail = true
  await page.getByRole('button', { name: 'Phân tích model 2', exact: true }).click()
  await expect(page.locator('.ai-demo-result')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('quá 60 giây')
})
