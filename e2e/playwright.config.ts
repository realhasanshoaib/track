import { defineConfig, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'

process.env.TRACK_E2E_NAMESPACE ??= `pw-${process.pid.toString(36)}`
process.env.TRACK_E2E_FIXTURE_TOKEN ??= randomUUID().replaceAll('-', '')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  timeout: 90_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node ../scripts/e2e/run-local-stack.mjs',
    url: 'http://127.0.0.1:4173/sign-in',
    reuseExistingServer: process.env.TRACK_E2E_REUSE_SERVER === '1',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    timeout: 360_000,
  },
})
