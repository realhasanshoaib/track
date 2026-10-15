import { defineConfig } from '@playwright/test'

// These fixtures render production mobile components, but do not authenticate
// or mutate a backend. Native playback and authenticated screens are separate gates.
export default defineConfig({
  testDir: './tests',
  testMatch: 'mobile-workspace-regression.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: '../artifacts/mobile-regression/browser',
  reporter: [['list'], ['json', { outputFile: '../artifacts/mobile-regression/browser-results.json' }]],
  use: {
    baseURL: 'http://localhost:8083',
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
})
