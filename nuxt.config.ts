import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

// Resolved from the layer itself, which an instance keeps in node_modules.
const fontStyles = [
  '@fontsource-variable/noto-sans/wght.css',
  '@fontsource-variable/noto-sans/wght-italic.css',
  '@fontsource-variable/noto-serif/wght.css',
  '@fontsource-variable/noto-serif/wght-italic.css',
].map((path) => createRequire(import.meta.url).resolve(path));

// Satori shapes the text of OG cards with HarfBuzz, whose hb.js loads hb.wasm
// by a path Nitro's file tracing cannot see. Left out of a build, every card
// fails while development, which reads node_modules directly, works.
const harfbuzzWasm = createRequire(
  createRequire(import.meta.url).resolve('satori'),
).resolve('harfbuzzjs/hb.wasm');

// Matches any file inside this layer, but not inside a nested `node_modules`.
// Nuxt disables auto-imports for modules resolved from `node_modules`, which is
// exactly where this layer lives once it is consumed as a dependency, so the
// layer has to opt its own sources back in.
const layerSourcePattern = new RegExp(
  `^${currentDir
    .replace(/\\/g, '/')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\//g, '[\\\\/]')}[\\\\/](?!node_modules[\\\\/])`,
);

export default defineNuxtConfig({
  compatibilityDate: '2026-04-28',
  devtools: { enabled: true },
  $meta: {
    name: 'thei',
  },
  ignore: ['/content', '/content/**', '/.thei', '/.thei/**'],
  css: [
    ...fontStyles,
    '#layers/thei/app/styles/main.css',
    '#layers/thei/app/styles/editor.css',
  ],
  pages: {
    pattern: ['**/*.vue', '!**/components/**'],
  },
  imports: {
    transform: {
      include: [layerSourcePattern],
    },
  },
  modules: ['#layers/thei/modules/thei/module.ts'],
  typescript: {
    nodeTsConfig: {
      include: [`${currentDir}/**/*`],
      exclude: [
        `${currentDir}/**/runtime/**/*`,
        `${currentDir}/**/node_modules/**/*`,
      ],
    },
  },
  nitro: {
    plugins: ['#layers/thei/server/thei/plugin.ts'],
    externals: {
      external: ['sharp'],
      traceInclude: [harfbuzzWasm],
    },
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
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@floating-ui/vue',
        '@vuepic/vue-datepicker',
        'date-fns/locale',
      ],
    },
  },
});
