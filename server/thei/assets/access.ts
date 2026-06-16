import type { AssetUsageMeta } from '#layers/thei/shared/asset';

export function assetUsageIsPrivate(meta: AssetUsageMeta | null): boolean {
  return Boolean(meta && 'isPrivate' in meta && meta.isPrivate);
}
