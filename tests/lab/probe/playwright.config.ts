import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The probe's own tests: its fixtures on a computer at 1× and on a phone at
// 2× with a finger, opened from disk — no server.
export default defineConfig({
  testDir: '.',
  testMatch: '*.browser.ts',
  outputDir: fileURLToPath(
    new URL('../../../.lab/probe/test-results', import.meta.url),
  ),
  fullyParallel: true,
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: { browserName: 'chromium' },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
    {
      name: 'phone',
      use: {
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
