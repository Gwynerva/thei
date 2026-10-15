import { eq } from 'drizzle-orm';
import { createError } from 'h3';
import type { ContentOwnerType } from '#layers/thei/shared/content';
import { entityVersion } from './entity-kinds';

/**
 * What every save of an entity's edit form takes besides the form itself,
 * whoever saves it — the admin form, or an AI client over MCP that read the
 * same form, changed what it was asked to and saves it back.
 */
export interface EntityEditOptions {
  /**
   * The `updatedAt` the entity had when the form was read. When given, a save
   * over an entity changed since is refused rather than written over it.
   */
  expectedUpdatedAt?: number;
  /** Runs inside the save's transaction, after everything else is written. */
  onWrite?: (tx: any, schema: any) => void;
  /**
   * Runs inside the transaction before anything is written, to check what
   * the write depends on where it cannot change underneath.
   */
  beforeWrite?: (tx: any, schema: any) => void;
}

/** What creating an entity from its edit form takes besides the form. */
export interface EntityCreateOptions {
  /** Runs inside the creation's transaction, with the new entity's id. */
  onCreate?: (tx: any, schema: any, id: string) => void;
}

/** The entity changed since its form was read; nothing was written. */
export class EntityEditConflict extends Error {
  constructor() {
    super(THEI_SERVER.phrase.entity_changed_since);
    this.name = 'EntityEditConflict';
  }
}

/**
 * The version an admin form says it was read at. Every form says one; a
 * save that says none comes from a page older than this release, and is
 * refused as a save over a change would be: the page is to be reloaded.
 */
export function formVersion(body: { version?: unknown }): number {
  if (typeof body?.version === 'number' && Number.isFinite(body.version))
    return body.version;
  throw createError({
    statusCode: 409,
    message: THEI_SERVER.phrase.entity_changed_since,
  });
}

/** The version an entity's form is read at: when it last changed. */
export function storedVersion(
  ownerType: Exclude<ContentOwnerType, 'profile'>,
  id: string,
): number {
  return entityVersion({ kind: ownerType, id }) ?? 0;
}

/**
 * Refuses, inside a transaction, a save over an entity that changed since
 * its form was read.
 */
export function assertEntityVersion(
  tx: any,
  table: any,
  idColumn: any,
  id: string,
  expectedUpdatedAt: number | undefined,
) {
  if (expectedUpdatedAt === undefined) return;
  const row = tx
    .select({ updatedAt: table.updatedAt })
    .from(table)
    .where(eq(idColumn, id))
    .get();
  if (row?.updatedAt !== expectedUpdatedAt) throw new EntityEditConflict();
}
