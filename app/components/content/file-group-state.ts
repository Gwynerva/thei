import type { ContentFileGroupItem } from '#layers/thei/shared/content';
import type { PendingUpload } from '#layers/thei/app/composables/pending-upload';

/**
 * A line of a group of files: a file of it, or one on its way in. A file on
 * its way holds the place it was added at, and lands there, whatever order
 * the uploads finish in.
 */
export interface ContentFileGroupEntry {
  id: string;
  item?: ContentFileGroupItem;
  upload?: PendingUpload;
}

/** The files the group holds, in its order: what is saved. */
export function fileGroupItems(
  entries: readonly ContentFileGroupEntry[],
): ContentFileGroupItem[] {
  return entries.flatMap((entry) => (entry.item ? [entry.item] : []));
}

/** The entries in the order of `ids`; one `ids` does not name stays last. */
export function orderFileGroupEntries(
  entries: readonly ContentFileGroupEntry[],
  ids: readonly string[],
): ContentFileGroupEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const named = ids.flatMap((id) => byId.get(id) ?? []);
  return [...named, ...entries.filter((entry) => !named.includes(entry))];
}

/** The upload's line becomes the file it brought, in the same place. */
export function landFileGroupEntry(
  entries: readonly ContentFileGroupEntry[],
  id: string,
  item: ContentFileGroupItem,
): ContentFileGroupEntry[] {
  return entries.map((entry) =>
    entry.id === id ? { id: item.id, item } : entry,
  );
}
