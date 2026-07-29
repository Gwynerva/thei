import { readdir, readFile } from 'node:fs/promises';
import { addTemplate, updateTemplates, useLogger } from 'nuxt/kit';
import type { Nuxt } from 'nuxt/schema';
import chokidar from 'chokidar';
import { debounce } from 'perfect-debounce';
import { normalizePath, type ViteDevServer } from 'vite';
import { hash } from '../../shared/utils/hash';

export interface IconsData {
  iconNames: string[];
  iconsHash: string;
  iconsSvg: string;
}

export async function buildIconsData(
  iconAssetsPath: string,
): Promise<IconsData> {
  let iconsSvg = `<!-- Thei Bundled Icons $hash -->
<svg xmlns="http://www.w3.org/2000/svg">`;

  const iconNames = (await readdir(iconAssetsPath))
    .filter((filename) => filename.endsWith('.svg'))
    .map((filename) => filename.replace('.svg', ''))
    .sort();

  let versionSource = '';

  for (const iconName of iconNames) {
    const iconContent = await readFile(
      `${iconAssetsPath}/${iconName}.svg`,
      'utf-8',
    );

    versionSource += `${iconName}\0${hash(iconContent, 24)}\n`;

    const viewBox = iconContent.match(/viewBox="([^"]*)"/)?.[1] ?? '0 0 24 24';

    iconsSvg += iconContent
      .replace(/<\?xml[^>]*>/g, '')
      .replace(
        /<svg[^>]*>([\s\S]*?)<\/svg>/,
        `<symbol id="${iconName}" viewBox="${viewBox}">$1</symbol>`,
      );
  }

  const iconsHash = hash(versionSource, 24);

  iconsSvg += '</svg>';
  iconsSvg = iconsSvg.replace('$hash', iconsHash);

  return {
    iconNames,
    iconsHash,
    iconsSvg,
  };
}

export function invalidateIconsModule(
  viteServer: ViteDevServer,
  modulePath: string,
) {
  const normalizedModulePath = normalizePath(modulePath);
  const rootedModulePath = `/${normalizedModulePath}`;
  const moduleIds = new Set([
    modulePath,
    normalizedModulePath,
    rootedModulePath,
    `/@fs/${normalizedModulePath}`,
    `virtual:nuxt:${encodeURIComponent(modulePath)}`,
    `virtual:nuxt:${encodeURIComponent(normalizedModulePath)}`,
    `virtual:nuxt:${encodeURIComponent(rootedModulePath)}`,
  ]);
  const modules = new Set(
    [...moduleIds].flatMap((id) => [
      ...(viteServer.moduleGraph.getModulesByFile(id) ?? []),
    ]),
  );

  for (const module of viteServer.moduleGraph.idToModuleMap.values()) {
    const id = normalizePath(module.id?.split('?', 1)[0] ?? '');
    const virtualPath = id.startsWith('virtual:nuxt:')
      ? normalizePath(decodeURIComponent(id.slice('virtual:nuxt:'.length)))
      : undefined;

    if (
      id &&
      (moduleIds.has(id) ||
        id === rootedModulePath ||
        id.endsWith(`/@fs/${normalizedModulePath}`) ||
        (virtualPath &&
          (normalizedModulePath === virtualPath ||
            normalizedModulePath.endsWith(`/${virtualPath}`))))
    ) {
      modules.add(module);
    }
  }

  for (const module of modules) {
    viteServer.moduleGraph.invalidateModule(module);
  }
}

interface IconsViteServer {
  viteServer: ViteDevServer;
  isClient: boolean;
}

export async function refreshIconsInDev(
  regenerate: () => Promise<void>,
  viteServers: Iterable<IconsViteServer>,
  iconsModulePath: string,
) {
  await regenerate();

  const servers = [...viteServers];

  for (const { viteServer } of servers) {
    invalidateIconsModule(viteServer, iconsModulePath);
  }

  for (const { viteServer, isClient } of servers) {
    if (isClient) {
      viteServer.ws.send({ type: 'full-reload', path: '*' });
    }
  }
}

export function debounceIconsRebuild(rebuild: () => Promise<void>, wait = 200) {
  return debounce(rebuild, wait);
}

export async function setupTheiIcons(nuxt: Nuxt, theiPath: string) {
  const iconAssetsPath = `${theiPath}/app/assets/icons`;
  const logger = useLogger('thei:icons');

  let iconsDataPromise: Promise<IconsData> | undefined;
  let rebuildIconsData = true;

  async function getIconsData() {
    if (!iconsDataPromise || rebuildIconsData) {
      rebuildIconsData = false;
      iconsDataPromise = buildIconsData(iconAssetsPath);
    }

    return await iconsDataPromise;
  }

  const iconsSvgTemplate = addTemplate({
    write: true,
    filename: 'thei/public/icons.svg',

    async getContents() {
      const iconsData = await getIconsData();
      return iconsData.iconsSvg;
    },
  });

  const iconsTsTemplate = addTemplate({
    write: true,
    filename: 'thei/icons.ts',

    async getContents() {
      const iconsData = await getIconsData();

      return `export const iconNames = ${JSON.stringify(iconsData.iconNames)} as const;
export type IconName = (typeof iconNames)[number];

export const iconsHash = '${iconsData.iconsHash}';

export const iconsHref = '/icons.svg?${iconsData.iconsHash}';
`;
    },
  });

  nuxt.options.alias ??= {};
  nuxt.options.alias['#thei/icons'] = iconsTsTemplate.dst;

  if (nuxt.options.dev) {
    const viteServers = new Map<
      ViteDevServer,
      { isClient: boolean; isServer: boolean }
    >();

    nuxt.hook('vite:serverCreated', (server, environment) => {
      viteServers.set(server, environment);
    });

    const rebuild = debounceIconsRebuild(async () => {
      rebuildIconsData = true;

      try {
        await refreshIconsInDev(
          async () => {
            await updateTemplates({
              filter: (template) =>
                template.dst === iconsTsTemplate.dst ||
                template.dst === iconsSvgTemplate.dst,
            });
          },
          [...viteServers].map(([viteServer, environment]) => ({
            viteServer,
            isClient: environment.isClient,
          })),
          iconsTsTemplate.dst,
        );
      } catch (error) {
        rebuildIconsData = true;
        logger.error('Failed to rebuild bundled icons:', error);
      }
    });

    const watcher = chokidar.watch(iconAssetsPath, {
      ignoreInitial: true,
    });

    watcher.on('all', rebuild);
    nuxt.hook('close', () => watcher.close());
  }
}
