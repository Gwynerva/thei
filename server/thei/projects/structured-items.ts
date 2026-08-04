import type { ContentOwnerType } from '#layers/thei/shared/content';
import { deleteContentForOwner } from '../content/repository';

export class ProjectStructuredItemStorageError extends Error {}

export async function prepareProjectStructuredItems<TItem, TPrepared>(
  items: TItem[] | undefined,
  options: {
    existingIds: Set<string>;
    getId: (item: TItem) => string | undefined;
    createId: () => Promise<string>;
    label: string;
    prepare: (item: TItem, id: string) => Promise<TPrepared>;
  },
): Promise<TPrepared[] | undefined> {
  if (items === undefined) return undefined;
  const submittedIds = new Set<string>();
  const prepared: TPrepared[] = [];

  for (const item of items) {
    const submittedId = options.getId(item);
    const id = submittedId ?? (await options.createId());
    if (submittedIds.has(id)) {
      throw new ProjectStructuredItemStorageError(`Duplicate ${options.label}`);
    }
    submittedIds.add(id);
    if (submittedId && !options.existingIds.has(id)) {
      throw new ProjectStructuredItemStorageError(`Unknown ${options.label}`);
    }
    prepared.push(await options.prepare(item, id));
  }

  return prepared;
}

export function projectStructuredItemIdsToRemove(
  existingIds: string[],
  nextIds: Iterable<string>,
) {
  const retained = new Set(nextIds);
  return existingIds.filter((id) => !retained.has(id));
}

export function deleteProjectStructuredItemContent(
  tx: any,
  schema: any,
  ownerType: ContentOwnerType,
  ids: string[],
) {
  for (const id of ids) deleteContentForOwner(tx, schema, ownerType, id);
}
