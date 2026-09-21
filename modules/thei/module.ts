import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Nuxt } from 'nuxt/schema';
import { join } from 'node:path';
import {
  resolvePath,
  addTemplate,
  addServerImports,
  defineNuxtModule,
} from 'nuxt/kit';
import { version } from '../../package.json';
import { setupTheiIcons } from './icons';
import { siteUrlBasePath } from '../../shared/site-url';

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

    const fontsDir = copyOgFonts(nuxt);

    nuxt.hook('nitro:config', (nitroConfig) => {
      // The OG renderer draws its text with real font files rather than
      // whatever the server happens to have installed, so they travel with
      // the build as server assets.
      nitroConfig.serverAssets ??= [];
      nitroConfig.serverAssets.push({
        baseName: 'thei-og-fonts',
        dir: fontsDir,
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

/**
 * Copies the four Noto Sans subsets the OG renderer needs out of the font
 * package, so the build carries exactly those files instead of the whole
 * family.
 */
function copyOgFonts(nuxt: Nuxt): string {
  const require = createRequire(import.meta.url);
  const target = join(nuxt.options.buildDir, 'thei/og-fonts');
  mkdirSync(target, { recursive: true });
  for (const subset of ['latin', 'cyrillic'])
    for (const weight of ['400', '700']) {
      const name = `noto-sans-${subset}-${weight}-normal.woff`;
      copyFileSync(
        require.resolve(`@fontsource/noto-sans/files/${name}`),
        join(target, name),
      );
    }
  return target;
}
