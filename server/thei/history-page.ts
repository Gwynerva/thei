import { and, eq, lt, or, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { createError } from 'h3';
import type {
  ProfileHistoryItemBase,
  ProfileHistoryPage,
} from '#layers/thei/shared/profile';

/**
 * Keyset pagination for the dated histories: avatars and statuses.
 *
 * Keyset on `(createdAt, id)` rather than an offset: entries are appended while
 * somebody is reading, and an offset would quietly repeat or skip a row every
 * time one arrives.
 */
type HistoryKey = { createdAt: number; id: string };

export function decodeHistoryCursor(cursor?: string): HistoryKey | undefined {
  if (!cursor) return undefined;
  try {
    const key = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (
      key &&
      Number.isSafeInteger(key.createdAt) &&
      typeof key.id === 'string'
    )
      return { createdAt: key.createdAt, id: key.id };
  } catch {}
  throw createError({ statusCode: 400, message: 'Invalid history cursor' });
}

/** Rows strictly older than the cursor, in the newest-first order. */
export function olderThan(
  table: { createdAt: SQLiteColumn; id: SQLiteColumn },
  key: HistoryKey | undefined,
): SQL | undefined {
  if (!key) return undefined;
  return or(
    lt(table.createdAt, key.createdAt),
    and(eq(table.createdAt, key.createdAt), lt(table.id, key.id)),
  );
}

/**
 * Turns `limit + 1` fetched rows into a page; the extra row only says whether
 * another page exists.
 */
export async function buildHistoryPage<
  Row extends HistoryKey,
  Item extends ProfileHistoryItemBase,
>(
  rows: Row[],
  limit: number,
  total: number,
  toItem: (row: Row) => Promise<Item>,
): Promise<ProfileHistoryPage<Item>> {
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  return {
    items: await Promise.all(selected.map(toItem)),
    total,
    ...(rows.length > limit && last
      ? {
          nextCursor: Buffer.from(
            JSON.stringify({ createdAt: last.createdAt, id: last.id }),
          ).toString('base64url'),
        }
      : {}),
  };
}
