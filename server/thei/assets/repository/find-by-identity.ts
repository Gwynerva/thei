import { and, eq } from 'drizzle-orm';

export async function findAssetByIdentity(
  familyUuid: string,
  contentHash: string,
  settingsKey: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.assets.findFirst({
    where: and(
      eq(schema.assets.familyUuid, familyUuid),
      eq(schema.assets.contentHash, contentHash),
      eq(schema.assets.settingsKey, settingsKey),
    ),
  });
}
