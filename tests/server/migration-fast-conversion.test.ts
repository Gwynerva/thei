import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import migration from '../../update/migrations/0.0.8-fast-conversion';

function openAssets(): Database.Database {
  const rawDb = new Database(':memory:');
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
  return rawDb;
}

function insert(
  rawDb: Database.Database,
  row: {
    uuid: string;
    family?: string;
    hash: string;
    key: string;
    settings: Record<string, unknown> | null;
  },
) {
  rawDb
    .prepare(
      `INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash,
         settingsKey, settings, type, size, touchedAt)
       VALUES (?, ?, 'webm', ?, ?, ?, ?, 'video', 1, 0)`,
    )
    .run(
      row.uuid,
      row.uuid,
      row.family ?? 'af-1',
      row.hash,
      row.key,
      row.settings === null ? null : JSON.stringify(row.settings),
    );
}

const read = (rawDb: Database.Database, uuid: string) =>
  rawDb
    .prepare('SELECT settingsKey, settings FROM assets WHERE assetUuid = ?')
    .get(uuid) as { settingsKey: string; settings: string | null };

describe('migration 0.0.8/003-fast-conversion', () => {
  it('drops the flag from video recipes and the part from their keys, fast or not', () => {
    const rawDb = openAssets();
    insert(rawDb, {
      uuid: 'fast',
      hash: 'h1',
      key: 'video-transform:q75:w1280:h720:strip:0:fast:1',
      settings: {
        type: 'video-transform',
        quality: 75,
        dimensions: { width: 1280, height: 720 },
        stripAudio: false,
        fastConversion: true,
      },
    });
    insert(rawDb, {
      uuid: 'slow',
      hash: 'h2',
      key: 'video-transform:q75:w1280:h720:crop:0,0,10,10:strip:1:fast:0',
      settings: {
        type: 'video-transform',
        quality: 75,
        dimensions: { width: 1280, height: 720 },
        stripAudio: true,
        fastConversion: false,
      },
    });
    insert(rawDb, {
      uuid: 'picture',
      hash: 'h3',
      key: 'image-transform:q75:w100:h100:fmt:avif',
      settings: { type: 'image-transform', quality: 75, format: 'avif' },
    });
    insert(rawDb, {
      uuid: 'preview',
      hash: 'h4',
      key: 'internal:media-preview',
      settings: null,
    });
    migration.up({ rawDb } as never);

    expect(read(rawDb, 'fast')).toEqual({
      settingsKey: 'video-transform:q75:w1280:h720:strip:0',
      settings: JSON.stringify({
        type: 'video-transform',
        quality: 75,
        dimensions: { width: 1280, height: 720 },
        stripAudio: false,
      }),
    });
    expect(read(rawDb, 'slow').settingsKey).toBe(
      'video-transform:q75:w1280:h720:crop:0,0,10,10:strip:1',
    );
    expect(JSON.parse(read(rawDb, 'slow').settings!)).not.toHaveProperty(
      'fastConversion',
    );
    expect(read(rawDb, 'picture').settingsKey).toBe(
      'image-transform:q75:w100:h100:fmt:avif',
    );
    expect(read(rawDb, 'preview')).toEqual({
      settingsKey: 'internal:media-preview',
      settings: null,
    });
  });

  it('leaves a row alone when its new key and bytes are already another row’s', () => {
    const rawDb = openAssets();
    insert(rawDb, {
      uuid: 'kept',
      hash: 'same',
      key: 'video-transform:q75:w1280:h720:strip:0',
      settings: { type: 'video-transform', quality: 75, stripAudio: false },
    });
    insert(rawDb, {
      uuid: 'twin',
      hash: 'same',
      key: 'video-transform:q75:w1280:h720:strip:0:fast:1',
      settings: {
        type: 'video-transform',
        quality: 75,
        stripAudio: false,
        fastConversion: true,
      },
    });
    migration.up({ rawDb } as never);
    expect(read(rawDb, 'twin').settingsKey).toBe(
      'video-transform:q75:w1280:h720:strip:0:fast:1',
    );
    expect(read(rawDb, 'kept').settingsKey).toBe(
      'video-transform:q75:w1280:h720:strip:0',
    );
  });
});
