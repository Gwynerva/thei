import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import chokidar from 'chokidar';
import { addTemplate, updateTemplates, useLogger } from 'nuxt/kit';
import type { Nuxt } from 'nuxt/schema';
import { debounce } from 'perfect-debounce';

/**
 * What the drawing of an Open Graph card depends on, as one hash.
 *
 * A card is cached under the hash of what it shows, so a release that draws
 * cards differently has to say so, or every card drawn before it would be
 * served for months. Hashing the code that draws them at build time covers
 * every helper the drawing reaches — the layouts, the palette, the fonts
 * list, the icons, the colour maths — without anyone keeping a list of
 * function names, and without a version number anyone has to remember to
 * bump. The versions of the renderer, the rasteriser and the fonts go in
 * too: the same code with a different satori draws different pixels.
 */
export const OG_SIGNATURE_SOURCES = [
  'server/thei/og',
  'server/thei/media/generated-icon.ts',
  'server/thei/assets/image-color.ts',
  'server/thei/assets/svg-raster-input.ts',
  'shared/oklch.ts',
  'shared/accent-color.ts',
  'shared/cloud-outline.ts',
  'shared/utils/hash.ts',
  'shared/entity-icon.ts',
  'app/assets/icons',
];

/**
 * What builds a card's content and what caches or serves it draw nothing. A
 * change there either changes the content, which names the card anew by
 * itself, or changes nothing of its pixels; hashed, it would only redraw
 * every card after a release for no reason.
 */
export const OG_SIGNATURE_EXCLUDED = [
  'server/thei/og/content',
  'server/thei/og/boot.ts',
  'server/thei/og/cache.ts',
  'server/thei/og/response.ts',
  'server/thei/og/targets.ts',
  'server/thei/og/version.ts',
];

const PACKAGES = ['satori', 'sharp', '@fontsource/noto-sans'];

async function filesOf(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(
    () => undefined,
  );
  if (!entries) return [path];
  const nested = await Promise.all(
    entries.map((entry) => filesOf(join(path, entry.name))),
  );
  return nested.flat();
}

export async function computeOgTemplateSignature(
  theiPath: string,
): Promise<string> {
  const hash = createHash('sha256');
  const excluded = OG_SIGNATURE_EXCLUDED.map((path) => join(theiPath, path));
  for (const source of OG_SIGNATURE_SOURCES) {
    const files = (await filesOf(join(theiPath, source)))
      .filter((file) => !excluded.some((path) => file.startsWith(path)))
      .sort();
    for (const file of files) {
      const content = await readFile(file, 'utf8').catch(() => '');
      // Line endings are how a checkout stores the file, not what it says.
      hash.update(`${file.slice(theiPath.length).replaceAll('\\', '/')}\0`);
      hash.update(content.replaceAll('\r\n', '\n'));
      hash.update('\0');
    }
  }
  const require = createRequire(join(theiPath, 'package.json'));
  for (const name of PACKAGES) {
    const { version } = require(`${name}/package.json`) as { version: string };
    hash.update(`${name}@${version}\0`);
  }
  return hash.digest('hex').slice(0, 32);
}

/**
 * The signature as `#thei/og-signature`, for the server to name its cards
 * with. In development it is recomputed when a source changes, so the
 * playground redraws its cards the way an update would.
 */
export function setupOgSignature(nuxt: Nuxt, theiPath: string) {
  const logger = useLogger('thei:og');
  // Plain JavaScript despite the extension, like the icon symbols: an
  // installed instance builds from node_modules/.cache, where Nitro does not
  // strip TypeScript.
  const template = addTemplate({
    write: true,
    filename: 'thei/og-signature.ts',
    async getContents() {
      const signature = await computeOgTemplateSignature(theiPath);
      return `export const ogTemplateSignature = '${signature}';\n`;
    },
  });
  nuxt.options.alias ??= {};
  nuxt.options.alias['#thei/og-signature'] = template.dst;
  nuxt.hook('nitro:config', (nitroConfig) => {
    nitroConfig.alias ??= {};
    nitroConfig.alias['#thei/og-signature'] = template.dst;
  });

  if (nuxt.options.dev) {
    const refresh = debounce(async () => {
      try {
        await updateTemplates({
          filter: (candidate) => candidate.dst === template.dst,
        });
      } catch (error) {
        logger.error('Failed to update the Open Graph signature:', error);
      }
    }, 300);
    const watcher = chokidar.watch(
      OG_SIGNATURE_SOURCES.map((source) => join(theiPath, source)),
      { ignoreInitial: true },
    );
    watcher.on('all', refresh);
    nuxt.hook('close', () => watcher.close());
  }
}
