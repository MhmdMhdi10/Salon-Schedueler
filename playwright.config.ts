import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level contract for the web workspace.
 *
 * The dev stack is intentionally external: the repository's Docker compose
 * setup owns both Vite and the API, while E2E_USE_WEB_SERVER=1 is available
 * for a local frontend-only run. Keeping the API external makes failures
 * reflect the same mobile workflow used during development.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: 'artifacts/playwright-test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/playwright-results.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5273',
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'desktop-responsive',
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-responsive',
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'functional',
      testMatch: /(?:functional|full-matrix)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'ux-desktop',
      testMatch: /ux\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'ux-mobile',
      testMatch: /ux\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer:
    process.env.E2E_USE_WEB_SERVER === '1'
      ? {
          command: 'npm run dev --workspace @salon/web -- --host 0.0.0.0',
          url: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        }
      : undefined,
});
