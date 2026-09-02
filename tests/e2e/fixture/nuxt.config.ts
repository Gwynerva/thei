import { fileURLToPath } from 'node:url';

export default defineNuxtConfig({
  extends: [fileURLToPath(new URL('../../../', import.meta.url))],
  srcDir: '.',
  hooks: {
    'pages:extend'(pages) {
      pages.push({
        name: 'editor-regression',
        path: '/editor-regression',
        file: fileURLToPath(
          new URL('./app/pages/editor-regression.vue', import.meta.url),
        ),
      });
    },
  },
  devtools: { enabled: false },
  devServer: { port: 3000, host: '127.0.0.1' },
  vite: { server: { strictPort: true } },
  nitro: {
    publicAssets: [
      { dir: fileURLToPath(new URL('./public/', import.meta.url)) },
    ],
  },
});
