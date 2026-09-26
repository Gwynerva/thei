import { defineConfig, devices } from '@playwright/test';
import { E2E_ORIGIN } from './fixture-url';

// Start the isolated fixture on port 3001 after checking its owner (AGENTS.md);
// it runs beside the playground on 3000.
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
    baseURL: E2E_ORIGIN,
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
