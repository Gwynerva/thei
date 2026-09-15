import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { storeAsset } from '../../../server/thei/assets/storage';
import { hashFile } from '../../../server/thei/assets/bytes';
import { processOriginalAsset } from '../../../server/thei/assets/process';
import { createAsset } from '../../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../../server/thei/assets/repository/touch';
import { schema } from '../../../server/thei/db/schema';
import { AssetType } from '../../../shared/asset';
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';

let root = '';
let rawDb: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-upload-stream-'));
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE assets (
      assetUuid text PRIMARY KEY NOT NULL,
      slug text NOT NULL UNIQUE,
      extension text NOT NULL,
      familyUuid text NOT NULL,
      contentHash text NOT NULL,
      settingsKey text NOT NULL,
      settings text,
      type text NOT NULL,
      size integer NOT NULL,
      touchedAt integer NOT NULL,
      meta text
    );
    CREATE UNIQUE INDEX assets_family_content_settings_idx
      ON assets (familyUuid, contentHash, settingsKey);
  `);
  db = drizzle(rawDb, { schema });
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    assets: {
      filePath: (contentHash: string, extension: string) =>
        join(root, contentHash.slice(0, 2), `${contentHash}.${extension}`),
      create: createAsset,
      findByIdentity: findAssetByIdentity,
      findByUuid: findAssetByUuid,
      findBySlug: findAssetBySlug,
      touch: touchAsset,
    },
  };
});

afterEach(async () => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
  await rm(root, { recursive: true, force: true });
});

async function stage(bytes: Buffer, extension: string) {
  const path = join(root, `staged.${extension}`);
  await writeFile(path, bytes);
  return {
    path,
    size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'),
    filename: `staged.${extension}`,
    extension,
    owned: true,
  };
}

describe('streaming upload storage', () => {
  it('never moves or deletes a file it does not own', async () => {
    const bytes = randomBytes(4 * 1024);
    const settings = createOriginalAssetSettings();
    const live = await stage(bytes, 'bin');

    // Re-deriving a variant passes the live library file as its source. Storage
    // may read it, but moving or deleting it would destroy a stored asset.
    const result = await storeAsset({
      bytes: {
        path: live.path,
        size: live.size,
        hash: live.hash,
        owned: false,
      },
      extension: 'bin',
      familyUuid: 'family-live',
      settingsKey: 'original',
      settings,
      type: AssetType.Other,
      meta: null,
    });

    expect(result.created).toBe(true);
    expect((await stat(live.path)).size).toBe(bytes.length);
    expect(
      await readFile(THEI_SERVER.assets.filePath(live.hash, 'bin')),
    ).toEqual(bytes);
  });

  it('discards a scratch file that dedup made redundant', async () => {
    const bytes = randomBytes(4 * 1024);
    const settings = createOriginalAssetSettings();
    const first = await stage(bytes, 'bin');
    await storeAsset({
      bytes: {
        path: first.path,
        size: first.size,
        hash: first.hash,
        owned: true,
      },
      extension: 'bin',
      familyUuid: 'family-a',
      settingsKey: 'original',
      settings,
      type: AssetType.Other,
      meta: null,
    });

    // Same family and key this time, so the identity already exists and
    // storeAsset returns early. A transcode output taking this path used to be
    // left in the temp directory with nothing to ever reclaim it.
    const again = await stage(bytes, 'bin');
    const result = await storeAsset({
      bytes: {
        path: again.path,
        size: again.size,
        hash: again.hash,
        owned: true,
      },
      extension: 'bin',
      familyUuid: 'family-a',
      settingsKey: 'original',
      settings,
      type: AssetType.Other,
      meta: null,
    });

    expect(result.created).toBe(false);
    await expect(stat(again.path)).rejects.toThrow();
  });

  it('moves a staged upload into the library instead of copying it', async () => {
    const bytes = randomBytes(64 * 1024);
    const source = await stage(bytes, 'bin');
    const processed = await processOriginalAsset(source);

    const { asset, created } = await storeAsset({
      bytes: processed.bytes,
      extension: processed.extension,
      familyUuid: `af-${source.hash}`,
      settingsKey: 'original',
      settings: createOriginalAssetSettings(),
      type: AssetType.Other,
      meta: null,
    });

    expect(created).toBe(true);
    expect(asset.contentHash).toBe(source.hash);
    expect(asset.size).toBe(bytes.length);

    const stored = THEI_SERVER.assets.filePath(asset.contentHash, 'bin');
    expect(await readFile(stored)).toEqual(bytes);
    // Moved, not copied: the staged file is gone rather than duplicated.
    await expect(stat(source.path)).rejects.toThrow();
  });

  it('hashes a file without reading it into memory', async () => {
    const bytes = randomBytes(256 * 1024);
    const path = join(root, 'big.bin');
    await writeFile(path, bytes);

    expect(await hashFile(path)).toEqual({
      hash: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    });
  });

  it('leaves the staged file alone when the bytes are already stored', async () => {
    const bytes = randomBytes(8 * 1024);
    const settings = createOriginalAssetSettings();

    const first = await stage(bytes, 'bin');
    await storeAsset({
      bytes: {
        path: first.path,
        size: first.size,
        hash: first.hash,
        owned: true,
      },
      extension: 'bin',
      familyUuid: 'family-a',
      settingsKey: 'original',
      settings,
      type: AssetType.Other,
      meta: null,
    });

    // A second upload of the same bytes under a different family gets its own
    // row but must not write, move, or disturb the existing file.
    const second = await stage(bytes, 'bin');
    const result = await storeAsset({
      bytes: {
        path: second.path,
        size: second.size,
        hash: second.hash,
        owned: true,
      },
      extension: 'bin',
      familyUuid: 'family-b',
      settingsKey: 'original',
      settings,
      type: AssetType.Other,
      meta: null,
    });

    expect(result.created).toBe(true);
    expect(
      await readFile(THEI_SERVER.assets.filePath(first.hash, 'bin')),
    ).toEqual(bytes);
    // The second copy was redundant, so storage removed it rather than
    // leaving scratch behind that nothing would ever reclaim.
    await expect(stat(second.path)).rejects.toThrow();
  });
});
