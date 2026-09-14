export const ASSET_UPLOAD_LIMITS = {
  media: 100 * 1024 * 1024,
  file: 500 * 1024 * 1024,
} as const;

export type AssetUploadLimitPolicy = keyof typeof ASSET_UPLOAD_LIMITS;

export const ASSET_UPLOAD_DEFAULT_MAX_SIZE = ASSET_UPLOAD_LIMITS.file;

export function resolveAssetMaxSize(
  policy: AssetUploadLimitPolicy | undefined,
  requestedMaxSize: number | undefined,
): number {
  if (policy)
    return Math.min(ASSET_UPLOAD_LIMITS[policy], requestedMaxSize ?? Infinity);
  if (requestedMaxSize === undefined) return ASSET_UPLOAD_DEFAULT_MAX_SIZE;
  return Math.min(requestedMaxSize, ASSET_UPLOAD_DEFAULT_MAX_SIZE);
}

export function isAssetUploadLimitPolicy(
  value: unknown,
): value is AssetUploadLimitPolicy {
  return typeof value === 'string' && Object.hasOwn(ASSET_UPLOAD_LIMITS, value);
}
