import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: `${repoRoot}/output/playwright/report` }],
  ],
  outputDir: `${repoRoot}/output/playwright/test-results`,
  timeout: 120_000,
  expect: { timeout: 45_000 },
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.ABM_E2E_APP_URL ?? 'http://127.0.0.1:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
