import { defineConfig, devices } from '@playwright/test';

// Start the isolated fixture on port 3000 after checking its owner (AGENTS.md).
// Never silently reuse an arbitrary server or select a different port.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  testIgnore: '.artifacts/**',
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  maxFailures: 1,
  globalSetup: './setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
