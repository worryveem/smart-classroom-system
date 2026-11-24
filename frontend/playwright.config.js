import { defineConfig } from '@playwright/test'
const port = Number(process.env.SMARTCLASS_E2E_PORT || 5173)

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, channel: process.env.SMARTCLASS_BROWSER_CHANNEL || undefined, viewport: { width: 1366, height: 900 }, trace: 'off', screenshot: 'off', video: 'off' },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: process.env.SMARTCLASS_E2E_REUSE === '1',
    timeout: 60000,
  },
})
