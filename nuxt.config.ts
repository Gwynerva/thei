import tailwindcss from '@tailwindcss/vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  compatibilityDate: '2026-04-28',
  devtools: { enabled: true },
  $meta: {
    name: 'thei',
  },
  ignore: ['content', 'content/**', '.thei', '.thei/**'],
  css: ['#layers/thei/app/styles/main.css'],
  pages: {
    pattern: ['**/*.vue', '!**/components/**'],
  },
  modules: ['#layers/thei/modules/thei/module.ts'],
  typescript: {
    nodeTsConfig: {
      include: [`${currentDir}/**/*`],
      exclude: [`${currentDir}/**/runtime/**/*`],
    },
  },
  nitro: {
    plugins: ['#layers/thei/server/thei/plugin.ts'],
    typescript: {
      tsConfig: {
        compilerOptions: {
          verbatimModuleSyntax: true,
        },
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@vue/devtools-core', '@vue/devtools-kit', '@floating-ui/vue'],
    },
  },
});
