import type { AssetType } from '#layers/thei/shared/asset';
import type { AssetMeta } from '../../db/schema/assets';
import type { AssetUploadSettings } from '#layers/thei/shared/asset-upload-settings';

export interface CreateAssetData {
  assetUuid: string;
  slug: string;
  extension: string;
  rawHash: string;
  settingsKey: string;
  settingsVersion: number;
  settings?: AssetUploadSettings | null;
  type: AssetType;
  size: number;
  meta?: AssetMeta | null;
}

export async function createAsset(data: CreateAssetData) {
  const { db, schema } = THEI_SERVER.useDb();
  await db.insert(schema.assets).values({ ...data, touchedAt: Date.now() });
}
