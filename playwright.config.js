import { defineConfig, devices } from '@playwright/test';

const env = globalThis.process?.env || {};
const port = Number(env.PLAYWRIGHT_PORT || 4173);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    launchOptions: { executablePath: env.VWC_CHROMIUM_PATH },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `node tests/serve.mjs`,
    url: `http://127.0.0.1:${port}/config.json`,
    reuseExistingServer: !env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
});
