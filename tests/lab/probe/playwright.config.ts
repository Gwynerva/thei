import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { VIEWPORTS } from '../variants';

// The lab's browser tests — the probe's on its fixtures, the recorder's on
// its own — on the lab's two screens (a computer at 1×, a phone at 2× with a
// finger), opened from disk: no server.
export default defineConfig({
  testDir: '..',
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
    { name: 'desktop', use: { ...VIEWPORTS.desktop } },
    { name: 'phone', use: { ...VIEWPORTS.phone } },
  ],
});
