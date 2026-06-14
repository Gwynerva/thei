export const ASSET_UPLOAD_LIMITS = {
  'project-media': 100 * 1024 * 1024,
  'project-other': 500 * 1024 * 1024,
} as const;

export type AssetUploadLimitPolicy = keyof typeof ASSET_UPLOAD_LIMITS;

export const ASSET_UPLOAD_DEFAULT_MAX_SIZE =
  ASSET_UPLOAD_LIMITS['project-other'];

export function isAssetUploadLimitPolicy(
  value: unknown,
): value is AssetUploadLimitPolicy {
  return typeof value === 'string' && Object.hasOwn(ASSET_UPLOAD_LIMITS, value);
}
