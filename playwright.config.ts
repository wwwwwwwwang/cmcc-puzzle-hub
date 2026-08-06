import { defineConfig, devices } from '@playwright/test'

const e2eBaseUrl = 'http://127.0.0.1:3100'
const e2eAuthToken = process.env.E2E_TEST_AUTH_TOKEN

if (!e2eAuthToken) {
  throw new Error('请通过 pnpm test:e2e 运行 Playwright 测试')
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --hostname 127.0.0.1 --port 3100',
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      E2E_TEST_AUTH_TOKEN: e2eAuthToken,
    },
  },
  projects: [
    {
      name: 'iPhone SE',
      use: { ...devices['iPhone SE'] },
    },
    {
      name: 'iPhone 13',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: '430x932',
      use: {
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
