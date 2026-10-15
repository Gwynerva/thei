import { formOwnerVersion } from '../entity-kinds';
import { and, eq } from 'drizzle-orm';
import {
  type ContentOutputData,
  type ContentOwnerType,
  type ContentSlot,
} from '#layers/thei/shared/content';
import type { ApiTokenPrincipal } from '../api-tokens';
import { contentOwnerKeys, describeHistoryData } from '../content/history';
import {
  applyPreparedContentSave,
  prepareContentForSave,
} from '../content/repository';

/**
 * One text of one entity, changed on its own: everything else the entity
 * holds stays exactly as it is.
 *
 * An admin form saves an entity whole, and a field it leaves out is cleared;
 * nothing written from outside the form may go through that. A change names
 * the version of the text it was made from, and is refused if the text has
 * changed since — two writers never silently overwrite each other.
 */
export class EntityPatchError extends Error {}

/** Refuses a change, in words the model — or the owner — reads. */
export function refuse(message: string): never {
  throw new EntityPatchError(message);
}

export interface TextTarget {
  ownerType: ContentOwnerType;
  ownerId: string;
  slot: ContentSlot;
}

export interface StoredText {
  data: ContentOutputData | null;
  /** `content.updatedAt`, which moves only when the blocks change; `null` while empty. */
  version: number | null;
}

function readRow(tx: any, schema: any, target: TextTarget) {
  return tx
    .select({ data: schema.content.data, updatedAt: schema.content.updatedAt })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, target.ownerType),
        eq(schema.content.ownerId, target.ownerId),
        eq(schema.content.slot, target.slot),
      ),
    )
    .get() as { data: ContentOutputData; updatedAt: number } | undefined;
}

export function readStoredText(target: TextTarget): StoredText {
  const { db, schema } = THEI_SERVER.useDb();
  const row = readRow(db, schema, target);
  return { data: row?.data ?? null, version: row?.updatedAt ?? null };
}

function assertVersion(current: number | null, expected: number | null) {
  if (current !== expected)
    throw new EntityPatchError(
      `The text has changed since it was read (its version is now ${current ?? 'none: empty'}, not ${expected ?? 'none'}). Read it again and redo the change.`,
    );
}

export interface TextSaveOptions {
  expectedVersion: number | null;
  /** May the text be left empty? A diary entry's body may not. */
  allowEmpty: boolean;
  /** Runs inside the save's transaction, after the text is written. */
  onWrite?: (tx: any, schema: any) => void;
}

export interface TextSaveResult {
  changed: boolean;
  version: number | null;
}

/**
 * Saves a text in place of the stored one. Only an editor token writes
 * texts, and it may bring in any file of the library; the files are checked
 * as the admin's own save checks them.
 */
export async function saveText(
  target: TextTarget,
  data: ContentOutputData,
  options: TextSaveOptions,
): Promise<TextSaveResult> {
  const current = readStoredText(target);
  assertVersion(current.version, options.expectedVersion);

  const prepared = await prepareContentForSave(
    target.ownerType,
    target.ownerId,
    target.slot,
    { data },
  );
  if (prepared.type === 'delete' && !options.allowEmpty)
    throw new EntityPatchError('This text cannot be left empty.');
  if (
    (prepared.type === 'save' && !prepared.changed) ||
    (prepared.type === 'delete' && current.version === null)
  )
    return { changed: false, version: current.version };

  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction((tx) => {
    // Checked again where it cannot change underneath: another save may
    // have landed while this one was being prepared.
    assertVersion(
      readRow(tx, schema, target)?.updatedAt ?? null,
      options.expectedVersion,
    );
    const formOwner = { kind: target.ownerType, id: target.ownerId };
    const ownerBefore = formOwnerVersion(formOwner, tx);
    applyPreparedContentSave(
      tx,
      schema,
      target.ownerType,
      target.ownerId,
      target.slot,
      prepared,
    );
    const owner = contentOwnerKeys(schema)[target.ownerType];
    const now = Date.now();
    if ('updatedAt' in owner.table)
      tx.update(owner.table)
        .set({ updatedAt: now })
        .where(eq(owner.id, target.ownerId))
        .run();
    // The project's form holds its sections whole, so a section's text moves
    // the project's version too: a form read before would write it back.
    if (target.ownerType === 'project-section') {
      const section = tx
        .select({ projectUuid: schema.projectContentSections.projectUuid })
        .from(schema.projectContentSections)
        .where(eq(schema.projectContentSections.sectionUuid, target.ownerId))
        .get() as { projectUuid: string } | undefined;
      if (section)
        tx.update(schema.projects)
          .set({ updatedAt: now })
          .where(eq(schema.projects.projectUuid, section.projectUuid))
          .run();
    }
    const stored = readRow(tx, schema, target);
    const version = stored?.updatedAt ?? null;
    options.onWrite?.(tx, schema);
    return { changed: true, version };
  });
}
