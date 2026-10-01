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
 * time one arrives. A status is dated by its owner, so its history is keyed on
 * `(date, createdAt, id)` instead, and its cursor carries the day too.
 */
export type HistoryKey = { date?: string; createdAt: number; id: string };

export function decodeHistoryCursor(cursor?: string): HistoryKey | undefined {
  if (!cursor) return undefined;
  try {
    const key = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (
      key &&
      Number.isSafeInteger(key.createdAt) &&
      typeof key.id === 'string' &&
      (key.date === undefined || typeof key.date === 'string')
    )
      return {
        ...(key.date === undefined ? {} : { date: key.date }),
        createdAt: key.createdAt,
        id: key.id,
      };
  } catch {}
  throw createError({ statusCode: 400, message: 'Invalid history cursor' });
}

/**
 * Rows strictly older than the cursor, in the newest-first order. A table with
 * a `date` is compared on it first; the key must then carry one.
 */
export function olderThan(
  table: { date?: SQLiteColumn; createdAt: SQLiteColumn; id: SQLiteColumn },
  key: HistoryKey | undefined,
): SQL | undefined {
  if (!key) return undefined;
  const byTime = or(
    lt(table.createdAt, key.createdAt),
    and(eq(table.createdAt, key.createdAt), lt(table.id, key.id)),
  );
  if (!table.date) return byTime;
  // A dated history read with an undated key would page by the wrong order.
  if (key.date === undefined)
    throw new Error('A history ordered by day needs a cursor with its day');
  return or(lt(table.date, key.date), and(eq(table.date, key.date), byTime));
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
            JSON.stringify({
              ...(last.date === undefined ? {} : { date: last.date }),
              createdAt: last.createdAt,
              id: last.id,
            }),
          ).toString('base64url'),
        }
      : {}),
  };
}
