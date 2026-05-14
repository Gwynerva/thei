import { join } from 'node:path';
import {
  resolvePath,
  addTemplate,
  addServerImports,
  defineNuxtModule,
} from 'nuxt/kit';
import { version } from '../../package.json';
import { setupTheiIcons } from './icons';

export default defineNuxtModule({
  meta: {
    name: 'thei',
    version,
  },
  async setup(_options, nuxt) {
    const theiPath = await resolvePath('#layers/thei');
    const projectPath = await resolvePath('~');

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

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.alias ??= {};
      nitroConfig.alias['#thei/static'] = staticTemplate.dst;

      nitroConfig.storage ??= {};
      nitroConfig.storage['thei'] = {
        driver: 'fs',
        base: join(projectPath, '.thei'),
      };
    });

    addServerImports({
      name: 'THEI_SERVER',
      from: '#layers/thei/server/thei/global',
    });
  },
});
