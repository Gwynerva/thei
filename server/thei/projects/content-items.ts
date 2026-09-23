import type { ContentOwnerType } from '#layers/thei/shared/content';
import type { ProjectContentItemIdentity } from '#layers/thei/shared/api/project';
import {
  deleteContentForOwner,
  type PreparedContentSave,
} from '../content/repository';

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

type ContentItemFields = {
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  isPrivate: boolean;
};

/**
 * When a stage or a section was last edited.
 *
 * A project save sends every stage and section it holds, touched or not, so
 * the time of the save is only the time of an edit for the items that differ
 * from what is stored: their own fields, their content, or anything else the
 * caller compares (`otherChanged`, e.g. a stage's periods). The order of
 * sections is the project's arrangement, not an edit of a section.
 */
export function projectContentItemUpdatedAt(
  existing: (ContentItemFields & { updatedAt: number }) | undefined,
  next: ContentItemFields,
  contentSave: PreparedContentSave | undefined,
  now: number,
  otherChanged = false,
): number {
  if (!existing) return now;
  const contentChanged =
    contentSave?.type === 'save'
      ? contentSave.changed
      : Boolean(contentSave?.existingContentUuid);
  const fieldsChanged =
    existing.title !== next.title ||
    existing.summary !== next.summary ||
    existing.humanReadableSlug !== next.humanReadableSlug ||
    existing.publicId !== next.publicId ||
    Boolean(existing.isPrivate) !== next.isPrivate;
  return contentChanged || fieldsChanged || otherChanged
    ? now
    : existing.updatedAt;
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
