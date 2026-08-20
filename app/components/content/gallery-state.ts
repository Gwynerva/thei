import type { ContentGalleryItem } from '#layers/thei/shared/content';

export function gallerySelectedId(
  items: readonly ContentGalleryItem[],
  selectedId?: string,
): string | undefined {
  return selectedId && items.some((item) => item.id === selectedId)
    ? selectedId
    : items[0]?.id;
}

export function gallerySelectedIdAfterRemoval(
  items: readonly ContentGalleryItem[],
  removedId: string,
  selectedId?: string,
): string | undefined {
  const removedIndex = items.findIndex((item) => item.id === removedId);
  if (removedIndex < 0) return gallerySelectedId(items, selectedId);
  const remaining = items.filter((item) => item.id !== removedId);
  if (selectedId !== removedId) return gallerySelectedId(remaining, selectedId);
  return remaining[removedIndex]?.id ?? remaining[removedIndex - 1]?.id;
}
