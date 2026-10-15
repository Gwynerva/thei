import { and, eq } from 'drizzle-orm';
import type {
  ContentOutputData,
  ContentOwnerType,
} from '#layers/thei/shared/content';
import {
  entityText,
  entityVersion,
  formOwnerOf,
  formOwnerVersion,
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
import { changedForm, loadForm, saved } from '../forms/load';
import type { ActionUndo, ApplyWrite } from './types';

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

/** A value as it is kept with an action: plain data. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Fields of a form as plain data, to keep and to compare. */
export function pick(form: any, fields: string[]): Record<string, unknown> {
  return plain(Object.fromEntries(fields.map((field) => [field, form[field]])));
}

/** The form fields a change touched, as they were before it. */
function keptBefore(form: any, next: any) {
  const before: Record<string, unknown> = {};
  const cleared: string[] = [];
  for (const field of new Set([...Object.keys(form), ...Object.keys(next)])) {
    if (JSON.stringify(form[field]) === JSON.stringify(next[field])) continue;
    if (form[field] === undefined) cleared.push(field);
    else before[field] = form[field];
  }
  return JSON.stringify(before).length > UNDO_KEEP_LIMIT
    ? { before: null }
    : { before, ...(cleared.length ? { cleared } : {}) };
}

/**
 * Lays changes over an entity's form, as it reads now, and saves it.
 * Returns the undo it wrote.
 */
export async function applyFormChanges(
  key: EntityKey,
  changes: Changes,
  write: ApplyWrite,
): Promise<Extract<ActionUndo, { kind: 'form' }>> {
  assertKnown(key.kind as FormKind, changes);
  const loaded = await loadForm(key);
  const next = await changedForm(key, loaded, changes);
  const kept = keptBefore(loaded.form, next);
  if (kept.before && !Object.keys(kept.before).length && !kept.cleared)
    fail('It changes nothing: the entity already reads so.');
  let undo: Extract<ActionUndo, { kind: 'form' }> | undefined;
  saved(
    await loaded.save(next, {
      expectedUpdatedAt: loaded.version,
      onWrite: (tx, schema) => {
        undo = {
          kind: 'form',
          ...kept,
          versionBefore: loaded.version,
          versionAfter: entityVersion(loaded.owner, tx),
        };
        write(tx, schema, undo);
      },
    }),
  );
  return undo ?? fail('The change was not saved.');
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
): Promise<Extract<ActionUndo, { kind: 'text' }>> {
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
  let undo: Extract<ActionUndo, { kind: 'text' }> | undefined;
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
      undo = {
        kind: 'text',
        ownerType: target.ownerType,
        ownerId: key.id,
        slot: text.slot,
        beforeDigest,
        afterDigest: after ? describeHistoryData(after.data).digest : null,
        ownerBefore,
        ownerVersion: formOwnerVersion(owner, tx),
      };
      write(tx, schema, undo);
    },
  });
  if (!result.changed) fail('It changes nothing: the text already reads so.');
  return undo ?? fail('The text was not saved.');
}
