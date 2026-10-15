import { sql } from 'drizzle-orm';
import { assetHeldByHistorySql, assetsHeldByHistory } from '../content/history';
import { AI_HOLDING_STATES, assetHeldByAiSql } from './ai-hold-sql';

/**
 * What keeps a file nothing places from cleanup: a version of some text that
 * shows it, or an AI action that brings it or would put it back on undo —
 * one still waiting for the owner, being applied, or applied and undoable.
 */

/** SQL for "a version or an AI action still needs this asset". */
export function assetHeldSql(assetUuidColumn: unknown) {
  return sql`(${assetHeldByHistorySql(assetUuidColumn)} OR ${assetHeldByAiSql(assetUuidColumn)})`;
}

/** Of the given assets, the ones some AI action still needs. */
export function assetsHeldByAi(assetUuids: readonly string[]): Set<string> {
  if (!assetUuids.length) return new Set();
  const { rawDb } = THEI_SERVER.useDb();
  const held = new Set<string>();
  for (let index = 0; index < assetUuids.length; index += 500) {
    const chunk = assetUuids.slice(index, index + 500);
    const rows = rawDb
      .prepare(
        `SELECT DISTINCT j.value AS assetUuid FROM "ai-actions" a, json_each(a.assetUuids) j WHERE a.state IN (${AI_HOLDING_STATES}) AND j.value IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as { assetUuid: string }[];
    for (const row of rows) held.add(row.assetUuid);
  }
  return held;
}

export { assetHeldByAiSql, assetsHeldByHistory };
