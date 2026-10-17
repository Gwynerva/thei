import { and, eq } from 'drizzle-orm';
import type {
  ContentFieldModelValue,
  ContentOutputData,
  ContentOwnerType,
} from '#layers/thei/shared/content';
import {
  orderProjectSections,
  type ProjectSectionItem,
} from '#layers/thei/shared/project-content-item';
import type {
  RelationEditItem,
  RelationNote,
} from '#layers/thei/shared/relation';
import {
  cleanTagTitle,
  normalizeTagTitle,
  type TagEditItem,
} from '#layers/thei/shared/tag';
import {
  entityText,
  entityVersion,
  formOwnerOf,
  formOwnerVersion,
  refOf,
  textMayBeEmpty,
  type EntityKey,
} from '../../entity-kinds';
import {
  readStoredText,
  refuse as fail,
  saveText,
  type StoredText,
} from '../../entity-patch/text';
import { describeHistoryData, holdHistoryText } from '../../content/history';
import { assertKnown, type Changes, type FormKind } from '../forms/changes';
import { changedForm, formPart, loadForm, saved } from '../forms/load';
import type { ApplyWrite } from './types';

/**
 * The two ways an action changes the archive: through an entity's form, as
 * the owner's own save does, or one text of it. Either way the action is
 * marked applied, with what undoing it needs, in the transaction of the save.
 */

/**
 * Larger than this, what a change replaced — or left, for telling later
 * whether it still reads so — is not kept: the change stays.
 */
export const UNDO_KEEP_LIMIT = 1024 * 1024;

/** Fields of a form as plain data, to keep and to compare. */
export function pick(form: any, fields: string[]): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(fields.map((field) => [field, form[field]])),
    ),
  ) as Record<string, unknown>;
}

/** A text of a form by what it says; an empty one is none. */
function textDigest(value: ContentFieldModelValue | null | undefined) {
  const data = value?.data as ContentOutputData | undefined;
  return data?.blocks?.length ? describeHistoryData(data).digest : null;
}

function isText(value: unknown): value is ContentFieldModelValue {
  const data = (value as { data?: { blocks?: unknown } } | null)?.data;
  return Boolean(data && Array.isArray(data.blocks));
}

function noteAlike(note: RelationNote | undefined) {
  if (note?.type === 'shared')
    return note.text?.trim() ? { text: note.text.trim() } : null;
  if (note?.type === 'split') {
    const mine = note.currentText?.trim() ?? '';
    const theirs = note.relatedText?.trim() ?? '';
    return mine || theirs ? { mine, theirs } : null;
  }
  return null;
}

/** One field as it is compared; see `alike`. */
function valueAlike(field: string, value: any): unknown {
  if (value === undefined || value === null) return null;
  if (isText(value)) return textDigest(value);
  switch (field) {
    case 'tags':
      return (value as TagEditItem[]).map((tag) =>
        normalizeTagTitle(cleanTagTitle(tag.title)),
      );
    // Their order means nothing: a list is shown one kind at a time.
    case 'relations':
      return (value as RelationEditItem[])
        .map((item) => ({
          end: `${item.entityType}:${item.entityId}`,
          type: item.type,
          note: noteAlike(item.note),
        }))
        .sort((left, right) => left.end.localeCompare(right.end));
    case 'showcaseAssets':
    case 'otherAssets':
      return (
        value as { assetUuid: string; title?: string; caption?: string }[]
      ).map((item) => ({
        assetUuid: item.assetUuid,
        title: item.title?.trim() ?? '',
        caption: item.caption?.trim() ?? '',
        isPrivate: Boolean((item as { isPrivate?: boolean }).isPrivate),
      }));
    case 'externalLinks':
      return (
        value as {
          url: string;
          note?: string;
          name?: string;
          isPrivate?: boolean;
        }[]
      ).map((item) => ({
        url: item.url,
        note: item.note?.trim() ?? '',
        name: item.name?.trim() ?? '',
        isPrivate: Boolean(item.isPrivate),
      }));
    case 'sections':
      return orderProjectSections(value as ProjectSectionItem[]).map(
        (section) => ({
          publicId: section.publicId,
          title: section.title,
          summary: section.summary,
          slug: section.humanReadableSlug,
          isPrivate: section.isPrivate,
          periods: section.periods,
          content: textDigest(section.content),
          banner: section.bannerAssetUuid ?? null,
        }),
      );
    default:
      return value;
  }
}

/**
 * Fields of a form as they are compared: what a read gives and what a
 * change writes said alike — a tag by its name, a relation without the
 * other end's title, a text by what it says, a file or a link with what it
 * leaves out filled in, sections in the order a save keeps them, nothing as
 * null. So a change taken into a form and saved reads as made, and one that
 * writes what is there already changes nothing.
 */
export function alike(form: any, fields: string[]): string {
  return JSON.stringify(
    fields.map((field) =>
      valueAlike(field, JSON.parse(JSON.stringify(form?.[field] ?? null))),
    ),
  );
}

/** The fields of a form a change makes read otherwise. */
export function changedFields(form: any, next: any): string[] {
  return [...new Set([...Object.keys(form), ...Object.keys(next)])].filter(
    (field) => alike(form, [field]) !== alike(next, [field]),
  );
}

/** The form fields a change touched, as they were before it. */
function keptBefore(form: any, next: any) {
  const before: Record<string, unknown> = {};
  const cleared: string[] = [];
  for (const field of changedFields(form, next)) {
    if (form[field] === undefined) cleared.push(field);
    else before[field] = form[field];
  }
  return JSON.stringify(before).length > UNDO_KEEP_LIMIT
    ? { before: null }
    : { before, ...(cleared.length ? { cleared } : {}) };
}

/**
 * Lays changes over an entity's form, as it reads now, and saves it. What
 * its undo keeps is the entity's own part of the form: a section's item.
 */
export async function applyFormChanges(
  key: EntityKey,
  changes: Changes,
  write: ApplyWrite,
): Promise<void> {
  assertKnown(key.kind as FormKind, changes);
  const loaded = await loadForm(key);
  const next = await changedForm(key, loaded, changes);
  const part = formPart(key, loaded.form) ?? fail(`It is gone: ${refOf(key)}.`);
  const kept = keptBefore(part, formPart(key, next) ?? {});
  if (kept.before && !Object.keys(kept.before).length && !kept.cleared)
    fail('It changes nothing: the entity already reads so.');
  let written = false;
  saved(
    await loaded.save(next, {
      expectedUpdatedAt: loaded.version,
      onWrite: (tx, schema) => {
        write(tx, schema, {
          kind: 'form',
          ...kept,
          versionBefore: loaded.version,
          versionAfter: entityVersion(loaded.owner, tx),
        });
        written = true;
      },
    }),
  );
  if (!written) fail('The change was not saved.');
}

/** A stored text read inside a transaction. */
function storedIn(
  tx: any,
  schema: any,
  ownerType: string,
  ownerId: string,
  slot: string,
) {
  return tx
    .select({ data: schema.content.data })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, ownerType),
        eq(schema.content.ownerId, ownerId),
        eq(schema.content.slot, slot),
      ),
    )
    .get() as { data: ContentOutputData } | undefined;
}

/**
 * Writes one text of an entity from what it holds now. The text it replaces
 * is held in the history for as long as the action may be undone.
 */
export async function applyText(
  key: EntityKey,
  textName: string,
  actionUuid: string,
  compose: (
    stored: StoredText,
  ) => ContentOutputData | Promise<ContentOutputData>,
  write: ApplyWrite,
): Promise<void> {
  const text =
    entityText(key.kind, textName) ?? fail(`It has no text "${textName}".`);
  const target = {
    ownerType: key.kind as ContentOwnerType,
    ownerId: key.id,
    slot: text.slot,
  };
  const stored = readStoredText(target);
  const data = await compose(stored);
  const owner = formOwnerOf(key) ?? key;
  const ownerBefore = formOwnerVersion(owner);
  const beforeDigest = stored.data
    ? describeHistoryData(stored.data).digest
    : null;
  let written = false;
  const result = await saveText(target, data, {
    expectedVersion: stored.version,
    allowEmpty: textMayBeEmpty(text.slot),
    onWrite: (tx, schema) => {
      const after = storedIn(tx, schema, target.ownerType, key.id, text.slot);
      if (beforeDigest)
        holdHistoryText(
          tx,
          schema,
          { ownerType: target.ownerType, ownerRef: key.id, slot: text.slot },
          beforeDigest,
          actionUuid,
        );
      write(tx, schema, {
        kind: 'text',
        ownerType: target.ownerType,
        ownerId: key.id,
        slot: text.slot,
        beforeDigest,
        afterDigest: after ? describeHistoryData(after.data).digest : null,
        ownerBefore,
        ownerVersion: formOwnerVersion(owner, tx),
      });
      written = true;
    },
  });
  if (!result.changed) fail('It changes nothing: the text already reads so.');
  if (!written) fail('The text was not saved.');
}
