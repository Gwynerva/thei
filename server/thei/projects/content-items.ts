import type { ContentOwnerType } from '#layers/thei/shared/content';
import type { ProjectContentItemIdentity } from '#layers/thei/shared/api/project';
import { deleteContentForOwner } from '../content/repository';

export class ProjectContentItemStorageError extends Error {}

export async function prepareProjectContentItems<TItem, TPrepared>(
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
    if (submittedIds.has(id))
      throw new ProjectContentItemStorageError(`Duplicate ${options.label}`);
    submittedIds.add(id);
    if (submittedId && !options.existingIds.has(id))
      throw new ProjectContentItemStorageError(`Unknown ${options.label}`);
    prepared.push(await options.prepare(item, id));
  }
  return prepared;
}

export function projectContentItemIdsToRemove(
  existingIds: string[],
  nextIds: Iterable<string>,
) {
  const retained = new Set(nextIds);
  return existingIds.filter((id) => !retained.has(id));
}

export function deleteProjectContentItemContent(
  tx: any,
  schema: any,
  ownerType: ContentOwnerType,
  ids: string[],
) {
  for (const id of ids) deleteContentForOwner(tx, schema, ownerType, id);
}

/**
 * The identities a save assigned, paired with the public ID the form knows.
 *
 * A form that never learns the uuid of a stage it has just created keeps
 * offering it without one, and the next save reads the row it wrote itself as
 * somebody else's claim on that public ID.
 */
export function projectContentItemIdentities<TItem>(
  items: TItem[] | undefined,
  getId: (item: TItem) => string,
  getPublicId: (item: TItem) => string,
): ProjectContentItemIdentity[] {
  return (items ?? []).map((item) => ({
    publicId: getPublicId(item),
    itemUuid: getId(item),
  }));
}
