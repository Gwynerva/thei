import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteUsagesReleasing } from '../../../server/thei/assets/repository/usages/release';
import { freshTestDb } from '../../helpers/fresh-db';

/**
 * A file taken off what placed it — a banner, an icon, a file of a list —
 * gets its day of grace from that moment, unless something else still holds
 * it: another placement, a version of a text, an AI action.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  for (const assetUuid of ['a-banner', 'a-shared', 'a-held'])
    context.rawDb
      .prepare(
        "INSERT INTO assets (assetUuid, slug, extension, familyUuid, contentHash, settingsKey, type, size, touchedAt) VALUES (?, ?, 'webp', ?, ?, 'k', 'image', 1, 1)",
      )
      .run(assetUuid, assetUuid, assetUuid, assetUuid);
  const place = (assetUuid: string, containerId: string) =>
    context.rawDb
      .prepare(
        "INSERT INTO `asset-usages` (assetUuid, containerType, containerId, role) VALUES (?, 'event', ?, 'banner')",
      )
      .run(assetUuid, containerId);
  place('a-banner', 'e-1');
  place('a-shared', 'e-1');
  place('a-shared', 'e-2');
  place('a-held', 'e-1');
  context.rawDb
    .prepare(
      "INSERT INTO `ai-actions` (actionUuid, sessionUuid, kind, payload, certainty, state, fingerprint, assetUuids, createdAt) VALUES ('aia-1', 's', 'update', '{}', 'sure', 'applied', 'f', '[\"a-held\"]', 1)",
    )
    .run();
});

afterEach(async () => {
  await context.close();
});

const touchedAt = (assetUuid: string) =>
  (
    context.rawDb
      .prepare('SELECT touchedAt FROM assets WHERE assetUuid = ?')
      .get(assetUuid) as { touchedAt: number }
  ).touchedAt;

describe('a file taken off', () => {
  it('gets its grace from now, unless something else holds it', () => {
    const { db, schema } = context;
    db.transaction((tx) =>
      deleteUsagesReleasing(
        tx,
        schema,
        and(
          eq(schema.assetUsages.containerType, 'event'),
          eq(schema.assetUsages.containerId, 'e-1'),
        ),
      ),
    );
    expect(touchedAt('a-banner')).toBeGreaterThan(1);
    // Still placed on another event.
    expect(touchedAt('a-shared')).toBe(1);
    // An applied action would put it back on undo: its grace starts later.
    expect(touchedAt('a-held')).toBe(1);
    expect(
      context.rawDb
        .prepare(
          "SELECT COUNT(*) AS n FROM `asset-usages` WHERE containerId = 'e-1'",
        )
        .get(),
    ).toEqual({ n: 0 });
  });
});
