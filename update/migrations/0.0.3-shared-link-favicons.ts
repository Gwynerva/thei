import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { defineMigration } from './types';

/**
 * Names the icon of every external link after its own bytes, so that links
 * with the same icon share one file.
 *
 * Icons used to be named after the hash of the link's address: five pages of
 * one store kept five copies of one icon, and a browser fetched each of them.
 * Each file is copied to its new name, never moved or deleted, so a rollback
 * or a second run finds nothing to undo; the old names are left to the sweep
 * at boot, which removes files no row points at. A row whose file is missing
 * keeps its key and goes on showing the neutral tile, as it did. A copy is
 * made beside its name and renamed into place, so a file under a content
 * hash is always whole, whenever the update is cut short.
 *
 * The files are 48 px WebP of a few kilobytes, so reading one whole to hash
 * it is fine. An open page of the previous release asks for the old names
 * and shows the neutral tile until it is reloaded; that is deliberate, and
 * the update screen reloads the admin panel anyway.
 */
export default defineMigration({
  id: '0.0.3/003-shared-link-favicons',
  version: '0.0.3',
  title: {
    en: 'Keep one file per link icon',
    ru: 'Один файл на каждый значок ссылок',
  },
  description: {
    en: 'External links with the same icon now share one file instead of keeping a copy each.',
    ru: 'Внешние ссылки с одинаковым значком теперь используют один файл, а не хранят по копии.',
  },
  up({ rawDb, contentPath }) {
    const directory = contentPath('external-link-favicons');
    const rows = rawDb
      .prepare('SELECT `url`, `faviconKey` FROM `external-links`')
      .all() as Array<{ url: string; faviconKey: string }>;
    const update = rawDb.prepare(
      'UPDATE `external-links` SET `faviconKey` = ? WHERE `url` = ?',
    );
    for (const row of rows) {
      const current = join(directory, `${row.faviconKey}.webp`);
      if (!existsSync(current)) continue;
      const hash = createHash('sha256')
        .update(readFileSync(current))
        .digest('hex');
      if (hash === row.faviconKey) continue;
      const target = join(directory, `${hash}.webp`);
      if (!existsSync(target)) {
        const partial = `${target}.${process.pid}.${Date.now()}.tmp`;
        try {
          copyFileSync(current, partial);
          renameSync(partial, target);
        } finally {
          rmSync(partial, { force: true });
        }
      }
      update.run(hash, row.url);
    }
  },
});
