import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { generateSQLiteMigration } from 'drizzle-kit/api';
import { join } from 'node:path';
import { freshTestDb } from '../helpers/fresh-db';
import { createFreshDbContext } from '../../server/thei/db/utils';

vi.mock('drizzle-kit/api', async (original) => {
  const api = await original<typeof import('drizzle-kit/api')>();
  return {
    ...api,
    generateSQLiteMigration: vi.fn(api.generateSQLiteMigration),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).THEI_SERVER;
});

describe('fresh database installation', () => {
  it('creates current tables, indexes and constraints directly from the Drizzle schema', async () => {
    const context = await freshTestDb();
    try {
      const tables = context.rawDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row: any) => row.name);
      expect(tables).toEqual(
        expect.arrayContaining([
          'pages',
          'project-stages',
          'project-content-sections',
          'assets',
          'content',
        ]),
      );
      const indexes = context.rawDb
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((row: any) => row.name);
      expect(indexes).toEqual(
        expect.arrayContaining([
          'pages_slug_unique',
          'project-stages-public-id-unique',
          'project-content-sections-public-id-unique',
          'content-owner-slot-idx',
        ]),
      );
      expect(() =>
        context.rawDb
          .prepare('INSERT INTO pages(pageUuid) VALUES (?)')
          .run('invalid'),
      ).toThrow(/NOT NULL/);
      expect(() =>
        context.rawDb
          .prepare('INSERT INTO "stage-periods" VALUES (?, ?, ?, ?, ?)')
          .run('invalid', 'id', 0, '2026', '2026'),
      ).toThrow(/CHECK/);
      expect(context.rawDb.pragma('quick_check', { simple: true })).toBe('ok');
    } finally {
      await context.close();
    }
  });
  it('rolls back all DDL and closes the failed connection', async () => {
    const context = await freshTestDb();
    const failedPath = join(context.directory, 'failed.db');
    Object.assign(context.server, { contentPath: () => failedPath });
    vi.mocked(generateSQLiteMigration).mockResolvedValueOnce([
      'CREATE TABLE first (id TEXT)',
      'INVALID SQL',
    ]);
    const close = vi.spyOn(Database.prototype, 'close');
    try {
      await expect(createFreshDbContext()).rejects.toThrow();
      expect(close).toHaveBeenCalledOnce();
      const verification = new Database(failedPath);
      expect(
        verification
          .prepare("SELECT name FROM sqlite_master WHERE name='first'")
          .get(),
      ).toBeUndefined();
      verification.close();
    } finally {
      await context.close();
    }
  });
});
