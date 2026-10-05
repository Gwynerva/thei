import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import audioExtensions from '../../update/migrations/0.0.4-audio-extensions';

let rawDb: Database.Database | undefined;
afterEach(() => rawDb?.close());

/** The assets table as 0.0.3 left it. */
function legacyDb() {
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
  `);
  return rawDb;
}

function stored(
  db: Database.Database,
  uuid: string,
  extension: string,
  type: string,
  meta: string | null = '{}',
) {
  db.prepare(
    `INSERT INTO assets VALUES (?, ?, ?, 'family', ?, 'original', '{"type":"original"}', ?, 1, 0, ?)`,
  ).run(uuid, `slug-${uuid}`, extension, `hash-${uuid}`, type, meta);
}

describe('audio extensions migration', () => {
  it('files voice memos and other sound kept as plain files as recordings', () => {
    const db = legacyDb();
    stored(db, 'memo', 'm4a', 'other');
    stored(db, 'loud', 'AIFF', 'other');
    stored(db, 'song', 'mp3', 'audio');
    stored(db, 'doc', 'pdf', 'other');
    stored(
      db,
      'zip',
      'zip',
      'other',
      '{"archivedOriginal":{"extension":"m4a","size":1}}',
    );

    audioExtensions.up({ rawDb: db } as never);

    const types = Object.fromEntries(
      (
        db.prepare('SELECT assetUuid, type FROM assets').all() as {
          assetUuid: string;
          type: string;
        }[]
      ).map((row) => [row.assetUuid, row.type]),
    );
    expect(types).toEqual({
      memo: 'audio',
      loud: 'audio',
      song: 'audio',
      doc: 'other',
      // An archive of a recording is still an archive.
      zip: 'other',
    });
    // The bytes and what is known of them stay as they were.
    expect(
      db
        .prepare('SELECT meta, contentHash FROM assets WHERE assetUuid = ?')
        .get('memo'),
    ).toEqual({ meta: '{}', contentHash: 'hash-memo' });
  });
});
