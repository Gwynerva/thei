import type { AssetProfileId } from '../asset-profiles';
import type { AssetMeta } from '../asset';

export interface AssetCheckRequest {
  rawHash: string;
  profileId: AssetProfileId;
}

export type AssetCheckResponse =
  | { exists: false }
  | {
      exists: true;
      assetUuid: string;
      slug: string;
      extension: string;
      meta: AssetMeta | null;
    };

export interface AssetUploadResponse {
  assetUuid: string;
  slug: string;
  extension: string;
  meta: AssetMeta | null;
}
