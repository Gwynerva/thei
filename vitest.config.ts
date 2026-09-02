import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#layers/thei': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      'tests/e2e/**',
    ],
    environment: 'node',
    typecheck: {
      enabled: true,
    },
  },
});
