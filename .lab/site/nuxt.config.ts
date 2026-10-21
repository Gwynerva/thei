// The lab site: the layer over the lab's archive (`tests/lab/`, `bun run lab`).
// Opened as http://lab.localhost:3003 — a worktree gets a host name and a port
// of its own — so its session never meets the playground's or the fixture's.
import { fileURLToPath } from 'node:url';
import { labPort } from '../../tests/lab/config';

export default defineNuxtConfig({
  extends: ['../..'],
  devServer: { port: labPort(), host: '127.0.0.1' },
  devtools: { enabled: false },
  // Plays wait for the whole page to hydrate, as the browser tests do.
  plugins: [
    fileURLToPath(
      new URL(
        '../../tests/e2e/fixture/plugins/hydration-signal.client.ts',
        import.meta.url,
      ),
    ),
  ],
});
