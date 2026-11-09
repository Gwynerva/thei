import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import migration from '../../update/migrations/0.0.8-asset-created-at';

describe('migration 0.0.8/004-asset-created-at', () => {
  it('dates every stored file by the last time it was touched', () => {
    const rawDb = new Database(':memory:');
    rawDb.exec(`
      CREATE TABLE assets (
        assetUuid text PRIMARY KEY NOT NULL,
        touchedAt integer NOT NULL
      );
      INSERT INTO assets (assetUuid, touchedAt) VALUES
        ('old', ${Date.UTC(2025, 0, 1)}),
        ('recent', ${Date.UTC(2026, 10, 8, 21, 30)});
    `);
    migration.up({ rawDb } as never);

    expect(
      rawDb
        .prepare(
          'SELECT assetUuid, touchedAt, createdAt FROM assets ORDER BY assetUuid',
        )
        .all(),
    ).toEqual([
      {
        assetUuid: 'old',
        touchedAt: Date.UTC(2025, 0, 1),
        createdAt: Date.UTC(2025, 0, 1),
      },
      {
        assetUuid: 'recent',
        touchedAt: Date.UTC(2026, 10, 8, 21, 30),
        createdAt: Date.UTC(2026, 10, 8, 21, 30),
      },
    ]);
    // A row stored afterwards without a date reads as 0 until it is given one.
    rawDb
      .prepare("INSERT INTO assets (assetUuid, touchedAt) VALUES ('new', 5)")
      .run();
    expect(
      rawDb
        .prepare("SELECT createdAt FROM assets WHERE assetUuid = 'new'")
        .get(),
    ).toEqual({ createdAt: 0 });
  });
});
