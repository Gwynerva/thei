import { and, eq, isNull, lt, not } from 'drizzle-orm';
import { assetHeldSql } from '../holds';

export async function findOrphanedAssets(cutoffMs: number) {
  const { db, schema } = THEI_SERVER.useDb();

  return db
    .select({
      assetUuid: schema.assets.assetUuid,
      extension: schema.assets.extension,
      type: schema.assets.type,
      meta: schema.assets.meta,
    })
    .from(schema.assets)
    .leftJoin(
      schema.assetUsages,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      and(
        isNull(schema.assetUsages.assetUuid),
        lt(schema.assets.touchedAt, cutoffMs),
        // A file a draft or a version still shows, or an AI action still
        // needs, is not unused: it is kept for as long as that lives.
        not(assetHeldSql(schema.assets.assetUuid)),
      ),
    );
}
