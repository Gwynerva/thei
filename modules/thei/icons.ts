import { readdir, readFile } from 'node:fs/promises';
import { addTemplate, addTypeTemplate, updateTemplates } from 'nuxt/kit';
import type { Nuxt } from 'nuxt/schema';
import chokidar from 'chokidar';
import { debounce } from 'perfect-debounce';
import { hash } from '../../shared/utils/hash';

interface IconsData {
  iconNames: string[];
  iconsHash: string;
  iconsSvg: string;
}

export async function setupTheiIcons(nuxt: Nuxt, theiPath: string) {
  const iconAssetsPath = `${theiPath}/app/assets/icons`;

  let iconsData: IconsData;
  let rebuildIconsData = false;

  async function maybeBuildIconData() {
    if (iconsData && !rebuildIconsData) {
      return iconsData;
    }

    let iconsSvg = `<!-- Thei Bundled Icons $hash -->
<svg xmlns="http://www.w3.org/2000/svg">`;

    const iconNames = (await readdir(iconAssetsPath))
      .filter((filename) => filename.endsWith('.svg'))
      .map((filename) => filename.replace('.svg', ''));

    let concatHashes = '';
    for (const iconName of iconNames) {
      const iconContent = await readFile(
        `${iconAssetsPath}/${iconName}.svg`,
        'utf-8',
      );
      concatHashes += hash(iconContent, 24) + '\n';
      const viewBox =
        iconContent.match(/viewBox="([^"]*)"/)?.[1] ?? '0 0 24 24';
      iconsSvg += iconContent
        .replace(/<\?xml[^>]*>/, '')
        .replace(
          /<svg[^>]*>([\s\S]*?)<\/svg>/,
          `<symbol id="${iconName}" viewBox="${viewBox}">$1</symbol>`,
        );
    }

    const iconsHash = hash(concatHashes, 24);

    iconsSvg += '</svg>';
    iconsSvg = iconsSvg.replace('$hash', iconsHash);

    iconsData = {
      iconNames,
      iconsHash,
      iconsSvg,
    };

    rebuildIconsData = false;
  }

  const iconsTsTemplate = addTemplate({
    write: true,
    filename: 'thei/icons.ts',
    async getContents() {
      await maybeBuildIconData();
      const urlHash = nuxt.options.dev
        ? Math.floor(Math.random() * 10000000000000)
        : iconsData.iconsHash;

      return `export const iconNames = ${JSON.stringify(iconsData.iconNames)} as const;
export type IconName = (typeof iconNames)[number];
export const iconsHash = '${iconsData.iconsHash}';
export const iconsHref = '/icons.svg?' + '${urlHash}';
`;
    },
  });

  nuxt.options.alias ??= {};
  nuxt.options.alias['#thei/icons'] = iconsTsTemplate.dst;

  addTemplate({
    write: true,
    filename: theiPath + '/public/icons.svg',
    async getContents() {
      await maybeBuildIconData();
      return iconsData.iconsSvg;
    },
  });

  if (nuxt.options.dev) {
    chokidar.watch(iconAssetsPath, { ignoreInitial: true }).on(
      'all',
      debounce(async () => {
        rebuildIconsData = true;
        await updateTemplates({
          filter: (template) => template.dst === iconsTsTemplate.dst,
        });
      }, 200),
    );
  }
}
