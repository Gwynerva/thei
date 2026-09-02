import { defineConfig, devices } from '@playwright/test';

// Start the isolated fixture on port 3000 after checking its owner (AGENTS.md).
// Never silently reuse an arbitrary server or select a different port.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: './setup.ts',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
