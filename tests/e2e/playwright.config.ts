import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

// Playwright builds the fixture and serves it on 3001, beside the playground
// on 3000, and stops it afterwards. A fixture already running there, such as
// `bun run e2e:dev` while iterating, is used as it is.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  testIgnore: '.artifacts/**',
  // One seeded database serves every test, and some of them add to it.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  globalSetup: './setup.ts',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '.artifacts/report' }],
  ],
  webServer: {
    command: 'bun run e2e:serve',
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    url: `${E2E_ORIGIN}/test-fixture.json`,
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    baseURL: E2E_ORIGIN,
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
