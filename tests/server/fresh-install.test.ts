import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { freshTestDb } from '../helpers/fresh-db';
import { createFreshDbContext } from '../../server/thei/db/utils';
import { readLedger, taskLedgerId } from '../../update/migrations/ledger';
import { migrationRegistry } from '../../update/migrations';
import { updateTaskRegistry } from '../../update/tasks';

const mocks = vi.hoisted(() => ({
  baselineSql: undefined as string[] | undefined,
}));

vi.mock('#layers/thei/update/migrations', async (original) => {
  const actual = await original<typeof import('../../update/migrations')>();
  return {
    ...actual,
    get baselineSql() {
      return mocks.baselineSql ?? actual.baselineSql;
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.baselineSql = undefined;
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
          'profiles',
          'statuses',
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
          .prepare('INSERT INTO "stage-periods" VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run('invalid', 'id', 0, '2026', '2026', 'exact', ''),
      ).toThrow(/CHECK/);
      const statusColumns = context.rawDb
        .pragma("table_info('statuses')")
        .map((column: any) => column.name);
      expect(statusColumns).toEqual(
        expect.arrayContaining([
          'id',
          'ownerType',
          'ownerId',
          'kind',
          'assetUuid',
          'text',
          'createdAt',
        ]),
      );
      expect(context.rawDb.pragma('quick_check', { simple: true })).toBe('ok');
    } finally {
      await context.close();
    }
  });
  it('records every migration and task as done, having no old content', async () => {
    const context = await freshTestDb();
    try {
      const ids = readLedger(context.rawDb).map((entry) => entry.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          ...migrationRegistry.map((migration) => migration.id),
          ...updateTaskRegistry.map((task) => taskLedgerId(task.id)),
        ]),
      );
      expect(ids).toContain('task:0.0.2/001-preview-frames');
    } finally {
      await context.close();
    }
  });

  it('rolls back all DDL and closes the failed connection', async () => {
    const context = await freshTestDb();
    const failedPath = join(context.directory, 'failed.db');
    Object.assign(context.server, { contentPath: () => failedPath });
    mocks.baselineSql = ['CREATE TABLE first (id TEXT)', 'INVALID SQL'];
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
