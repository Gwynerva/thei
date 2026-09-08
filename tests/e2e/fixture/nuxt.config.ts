import { fileURLToPath } from 'node:url';

export default defineNuxtConfig({
  extends: [fileURLToPath(new URL('../../../', import.meta.url))],
  srcDir: '.',
  hooks: {
    'pages:extend'(pages) {
      for (const name of [
        'editor-regression',
        'media-regression',
        'ambient-regression',
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
  devServer: { port: 3000, host: '127.0.0.1' },
  vite: { server: { strictPort: true } },
  nitro: {
    publicAssets: [
      { dir: fileURLToPath(new URL('./public/', import.meta.url)) },
    ],
  },
});
