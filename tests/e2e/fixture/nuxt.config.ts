import { fileURLToPath } from 'node:url';
import { E2E_PORT } from '../fixture-url';

export default defineNuxtConfig({
  extends: [fileURLToPath(new URL('../../../', import.meta.url))],
  srcDir: '.',
  hooks: {
    'pages:extend'(pages) {
      for (const name of [
        'editor-regression',
        'media-regression',
        'ambient-regression',
        'asset-regression',
      ]) {
        pages.push({
          name,
          path: `/${name}`,
          file: fileURLToPath(
            new URL(`./app/pages/${name}.vue`, import.meta.url),
          ),
        });
      }
    },
  },
  devtools: { enabled: false },
  runtimeConfig: {
    fixtureMedia: fileURLToPath(new URL('./media/', import.meta.url)),
  },
  devServer: { port: E2E_PORT, host: '127.0.0.1' },
  nitro: {
    publicAssets: [
      { dir: fileURLToPath(new URL('./public/', import.meta.url)) },
    ],
  },
});
