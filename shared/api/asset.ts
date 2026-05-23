import type { AssetProfileId } from '../asset-profiles';

export interface AssetCheckRequest {
  rawHash: string;
  profileId: AssetProfileId;
}

export type AssetCheckResponse =
  | { exists: false }
  | { exists: true; assetUuid: string; link: string; extension: string };

export interface AssetUploadResponse {
  assetUuid: string;
  link: string;
  extension: string;
}
