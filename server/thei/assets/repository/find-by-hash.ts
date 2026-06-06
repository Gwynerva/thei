import { and, eq } from 'drizzle-orm';

export async function findAssetBySettingsKey(
  rawHash: string,
  settingsKey: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.assets.findFirst({
    where: and(
      eq(schema.assets.rawHash, rawHash),
      eq(schema.assets.settingsKey, settingsKey),
    ),
  });
}
