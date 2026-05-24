import type { AssetType } from '#layers/thei/shared/asset';

export interface CreateAssetData {
  assetUuid: string;
  slug: string;
  extension: string;
  profileId: string;
  rawHash: string;
  type: AssetType;
  size: number;
}

export async function createAsset(data: CreateAssetData) {
  const { db, schema } = THEI_SERVER.useDb();
  await db.insert(schema.assets).values({ ...data, touchedAt: Date.now() });
}
