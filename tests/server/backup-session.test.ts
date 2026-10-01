import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assetFilePath } from '../../server/thei/assets/file-path';
import {
  endBackupSession,
  startBackupSession,
} from '../../server/thei/backup/session';
import { externalLinkFaviconPath } from '../../server/thei/external-links/favicon';
import { freshTestDb } from '../helpers/fresh-db';

/**
 * A backup client judges a loss by what the site uses. A file nothing places
 * any more — an original kept a day for the editor, a variant replaced, a
 * video taken out of every text — is swept by cleanup, and its going must not
 * look like the site shrinking, however large it was.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    // The content root itself too, as a backup walks it.
    contentPath: (...parts: string[]) => join(context.directory, ...parts),
    projectPath: (...parts: string[]) => join(context.directory, ...parts),
    assets: { filePath: assetFilePath },
    console: {
      tag: () => ({ log: () => {}, warn: () => {}, error: () => {} }),
    },
  });
  await writeFile(context.server.contentPath('thei.config.json'), '{}');
});

afterEach(async () => {
  await context.close();
});

async function file(path: string, size: number) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.alloc(size));
}

/** A stored file, and the row that is its handle. */
async function asset(uuid: string, size: number) {
  const contentHash = uuid.padEnd(64, '0');
  await file(assetFilePath(contentHash, 'webp'), size);
  context.rawDb
    .prepare(
      `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, type, size, touchedAt)
       VALUES (?, ?, 'webp', ?, ?, 'original', 'image', ?, 0)`,
    )
    .run(uuid, uuid, uuid, contentHash, size);
}

function place(assetUuid: string, containerType: string, containerId: string) {
  context.rawDb
    .prepare(
      `INSERT INTO "asset-usages" (assetUuid, containerType, containerId, role) VALUES (?, ?, ?, 'content')`,
    )
    .run(assetUuid, containerType, containerId);
}

describe('a backup session', () => {
  it('measures what the site uses apart from everything it holds', async () => {
    await asset('aa1', 1_000); // in a text
    await asset('bb2', 300); // the still of the file in the text
    await asset('cc3', 50_000_000); // an original nothing places
    await asset('dd4', 400); // the still of the unplaced original
    place('aa1', 'content', 'c-1');
    place('bb2', 'asset', 'aa1');
    place('dd4', 'asset', 'cc3');
    // A link's icon, and an icon an older name left behind.
    const iconKey = 'ee'.padEnd(64, '5');
    await file(externalLinkFaviconPath(iconKey), 200);
    await file(externalLinkFaviconPath('ff'.padEnd(64, '6')), 200);
    context.rawDb
      .prepare(
        `INSERT INTO "external-links" (url, faviconKey, touchedAt) VALUES ('https://example.com/', ?, 0)`,
      )
      .run(iconKey);

    const session = await startBackupSession({ kind: 'manual' });
    try {
      // The database, the config, two images, two stills and two icons.
      expect(session.totalFiles).toBe(8);
      // The database, the config, the placed image, its still, the icon.
      expect(session.usedFiles).toBe(5);
      expect(session.totalBytes - session.usedBytes).toBe(
        50_000_000 + 400 + 200,
      );
    } finally {
      await endBackupSession(session.sessionId);
    }
  });
});
