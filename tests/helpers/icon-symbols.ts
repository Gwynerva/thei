import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIconSvg, type IconSymbol } from '../../shared/icon-svg';

/**
 * Stands in for the build-time `#thei/icon-symbols` template: the same icons,
 * read straight from the assets the template is built from.
 */
const directory = fileURLToPath(
  new URL('../../app/assets/icons/', import.meta.url),
);

export const iconSymbols: Record<string, IconSymbol> = Object.fromEntries(
  readdirSync(directory)
    .filter((filename) => filename.endsWith('.svg'))
    .map((filename) => [
      filename.replace('.svg', ''),
      parseIconSvg(readFileSync(`${directory}${filename}`, 'utf-8')),
    ]),
);
