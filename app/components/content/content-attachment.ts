import type { ContentAssetData } from '#layers/thei/shared/content';

export function contentAttachmentAssetChanged(
  current: ContentAssetData,
  next: ContentAssetData,
): boolean {
  return current.assetUuid !== next.assetUuid;
}

export function contentAssetSelectionChanged(
  current: ContentAssetData,
  next: ContentAssetData | null,
) {
  return next === null || current.assetUuid !== next.assetUuid;
}

export function normalizeContentAttachmentPaste(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}
