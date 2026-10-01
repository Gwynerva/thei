import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Nuxt } from 'nuxt/schema';
import { dirname, join } from 'node:path';
import {
  resolvePath,
  addTemplate,
  addServerImports,
  defineNuxtModule,
} from 'nuxt/kit';
import { version } from '../../package.json';
import { setupTheiIcons } from './icons';
import { setupOgSignature } from './og-signature';
import { siteUrlBasePath } from '../../shared/site-url';
import { ogFontAssetPattern } from '../../server/thei/og/font-set';

export default defineNuxtModule({
  meta: {
    name: 'thei',
    version,
  },
  async setup(_options, nuxt) {
    const theiPath = await resolvePath('#layers/thei');
    const projectPath = await resolvePath('~');

    applyBasePath(nuxt, projectPath);

    await setupTheiIcons(nuxt, theiPath);
    setupOgSignature(nuxt, theiPath);

    const staticPublicTemplate = addTemplate({
      write: true,
      filename: 'thei/static-public.ts',
      getContents: () => `
        export const version = '${version}';
      `,
    });
    nuxt.options.alias ??= {};
    nuxt.options.alias['#thei/static-public'] = staticPublicTemplate.dst;

    const staticTemplate = addTemplate({
      write: true,
      filename: 'thei/static.ts',
      getContents: () => `
        export const theiPath = '${theiPath}';
        export const projectPath = '${projectPath}';
      `,
    });
    nuxt.options.alias['#thei/static'] = staticTemplate.dst;

    nuxt.hook('nitro:config', (nitroConfig) => {
      // The OG renderer draws its text with real font files rather than
      // whatever the server happens to have installed, so the files it uses
      // (`font-set.ts` lists them) travel with the build as server assets,
      // straight from the font package. A copy in the build directory would not: `nuxt build`
      // empties that directory after the modules have run.
      nitroConfig.serverAssets ??= [];
      nitroConfig.serverAssets.push({
        baseName: 'thei-og-fonts',
        dir: ogFontsDir(),
        pattern: ogFontAssetPattern(),
      });

      nitroConfig.alias ??= {};
      nitroConfig.alias['#thei/static'] = staticTemplate.dst;

      nitroConfig.storage ??= {};
      nitroConfig.storage['thei'] = {
        driver: 'fs',
        base: join(projectPath, '.thei'),
      };

      nitroConfig.publicAssets ??= [];
      nitroConfig.publicAssets.push({
        dir: join(nuxt.options.buildDir, 'thei/public'),
        maxAge: nuxt.options.dev ? 0 : 60 * 60 * 24 * 365,
      });
    });

    addServerImports({
      name: 'THEI_SERVER',
      from: '#layers/thei/server/thei/global',
    });
  },
});

/**
 * Serves the site from the subfolder its configured address names.
 *
 * `app.baseURL` is a build-time decision — the router, the asset URLs and
 * every route Nitro mounts are built around it — so it is read here rather
 * than from the running config. Changing the folder therefore needs a rebuild,
 * which the panel says out loud. `NUXT_APP_BASE_URL` still wins, because a
 * deployment that sets it is overriding the build on purpose.
 */
function applyBasePath(nuxt: Nuxt, projectPath: string) {
  if (process.env.NUXT_APP_BASE_URL) return;
  let siteUrl = '';
  try {
    const raw = readFileSync(
      join(projectPath, 'content', 'thei.config.json'),
      'utf8',
    );
    siteUrl = (JSON.parse(raw) as { siteUrl?: string }).siteUrl ?? '';
  } catch {
    // No content directory yet: an installation starts at the domain root.
    return;
  }
  const basePath = siteUrlBasePath(siteUrl);
  if (basePath === '/') return;
  nuxt.options.app.baseURL = basePath;
  nuxt.options.runtimeConfig.app = {
    ...nuxt.options.runtimeConfig.app,
    baseURL: basePath,
  };
}

/** The font package's folder of font files. */
function ogFontsDir(): string {
  return dirname(
    createRequire(import.meta.url).resolve(
      '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff',
    ),
  );
}
