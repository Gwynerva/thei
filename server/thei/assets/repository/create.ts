import type { AssetType } from '#layers/thei/shared/asset';

export interface CreateAssetData {
  assetUuid: string;
  link: string;
  extension: string;
  profileId: string;
  rawHash: string;
  type: AssetType;
  size: number;
}

export function createAsset(data: CreateAssetData) {
  const { db, schema } = THEI_SERVER.useDb();
  db.insert(schema.assets)
    .values({ ...data, touchedAt: Date.now() })
    .run();
}
