import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_ACTION } from '../../../shared/project-action';
import { schema } from '../../../server/thei/db/schema';
import { syncProjectActionUsages } from '../../../server/thei/projects/action-usages';

let rawDb: Database.Database | undefined;

afterEach(() => rawDb?.close());

describe('project action usages', () => {
  it('creates, preserves, updates, and detaches the three CTA roles minimally', () => {
    rawDb = new Database(':memory:');
    rawDb.exec(`
      CREATE TABLE "asset-usages" (
        assetUuid text NOT NULL,
        containerType text NOT NULL,
        containerId text NOT NULL,
        role text NOT NULL,
        meta text,
        PRIMARY KEY(assetUuid, containerType, containerId, role)
      );
    `);
    const db = drizzle(rawDb, { schema });
    const action = {
      ...DEFAULT_PROJECT_ACTION,
      enabled: true,
      text: 'Download',
      target: 'file' as const,
      fileAssetUuid: 'file',
      fileTitle: 'Guide',
      iconMode: 'asset' as const,
      iconAssetUuid: 'icon',
      backgroundMode: 'asset' as const,
      backgroundAssetUuid: 'background',
      isPrivate: false,
    };

    syncProjectActionUsages(db, schema, [], 'project', action);
    const initial = db.select().from(schema.assetUsages).all();
    expect(initial).toHaveLength(3);
    expect(initial.map((usage) => usage.role).sort()).toEqual([
      'action-background',
      'action-file',
      'action-icon',
    ]);

    const current = initial.map((usage) => ({
      asset: { assetUuid: usage.assetUuid },
      role: usage.role,
      meta: usage.meta,
    }));
    const beforeNoop = rawDb!.totalChanges;
    syncProjectActionUsages(db, schema, current, 'project', action);
    expect(rawDb!.totalChanges).toBe(beforeNoop);

    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'stale-icon',
        containerType: 'project',
        containerId: 'project',
        role: 'action-icon',
        meta: { role: 'action-icon', isPrivate: false },
      })
      .run();
    const withStaleUsage = db
      .select()
      .from(schema.assetUsages)
      .all()
      .map((usage) => ({
        asset: { assetUuid: usage.assetUuid },
        role: usage.role,
        meta: usage.meta,
      }));
    syncProjectActionUsages(db, schema, withStaleUsage, 'project', action);
    expect(
      db
        .select()
        .from(schema.assetUsages)
        .all()
        .some((usage) => usage.assetUuid === 'stale-icon'),
    ).toBe(false);

    syncProjectActionUsages(db, schema, current, 'project', {
      ...action,
      isPrivate: true,
    });
    expect(
      db
        .select()
        .from(schema.assetUsages)
        .all()
        .every(
          (usage) =>
            usage.meta &&
            'isPrivate' in usage.meta &&
            usage.meta.isPrivate === true,
        ),
    ).toBe(true);

    const privateUsages = db
      .select()
      .from(schema.assetUsages)
      .all()
      .map((usage) => ({
        asset: { assetUuid: usage.assetUuid },
        role: usage.role,
        meta: usage.meta,
      }));
    syncProjectActionUsages(
      db,
      schema,
      privateUsages,
      'project',
      DEFAULT_PROJECT_ACTION,
    );
    expect(db.select().from(schema.assetUsages).all()).toEqual([]);
  });
});
