import { defineConfig } from '@playwright/test';

const origin = 'http://localhost:5187';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['./tests/support/safe-reporter.js']],
  use: {
    baseURL: origin,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined),
    // Playwright DOM traces can contain password input values and one-time URLs.
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'deterministic', testMatch: '**/*.mock.spec.js' },
    { name: 'live', testMatch: '**/*.live.spec.js' },
  ],
  webServer: {
    command: 'node tests/start-test-vite.mjs',
    url: origin,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
