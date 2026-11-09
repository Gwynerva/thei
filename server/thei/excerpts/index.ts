import { and, eq, inArray, or } from 'drizzle-orm';
import type {
  ExcerptItem,
  ExcerptParentType,
  ExcerptValue,
} from '#layers/thei/shared/excerpt';
import { createEmptyContentFieldValue } from '#layers/thei/shared/content';
import {
  relationEndpointKey,
  relationEndpointsEqual,
  type RelationEndpoint,
} from '#layers/thei/shared/relation';
import type { ProjectContentItemIdentity } from '#layers/thei/shared/api/project';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  applyPreparedContentSave,
  prepareContentForSave,
  type PreparedContentSave,
} from '../content/repository';
import {
  deleteProjectContentItemContent,
  prepareProjectContentItems,
  projectContentItemIdentities,
  projectContentItemIdsToRemove,
  projectContentItemUpdatedAt,
} from '../projects/content-items';
import {
  applyRelations,
  deleteRelations,
  getRelations,
  prepareRelations,
  relationRowsOf,
  touchRelationEndpoint,
} from '../relations';
import {
  deleteEntityBanners,
  readEntityBannerUuids,
  syncEntityBanner,
} from '../entity-banner';
import { buildAdminAssetUrls } from '../assets/urls';
import type { excerpts as excerptsTable } from '../db/schema/excerpts';

/**
 * Excerpts as their parents' forms save and read them.
 *
 * A diary entry, an event and a project each hold their excerpts the way a
 * project holds its sections: the whole list travels with the form, items
 * are told apart by the uuid the server gave them, and whatever the list
 * leaves out is deleted with its text, its banner and its relations. The one
 * thing a section has not: what the excerpt is about, ordinary relations
 * with the excerpt as one end, prepared here once the excerpt has its id and
 * written in the parent's transaction.
 */

export type ExcerptParent = { type: ExcerptParentType; id: string };

export class ExcerptStorageError extends Error {}

type ExcerptRow = typeof excerptsTable.$inferSelect;

type PreparedExcerptRelations = NonNullable<
  Awaited<ReturnType<typeof prepareRelations>>
>;

export type PreparedExcerpt = Omit<ExcerptItem, 'relations'> & {
  excerptUuid: string;
  contentSave: PreparedContentSave;
  relations: PreparedExcerptRelations;
};

function parentWhere(schema: any, parent: ExcerptParent) {
  return and(
    eq(schema.excerpts.parentType, parent.type),
    eq(schema.excerpts.parentId, parent.id),
  );
}

function ownerOf(excerptUuid: string): RelationEndpoint {
  return { type: 'excerpt', id: excerptUuid };
}

/**
 * Checks the excerpts a parent is saved with, gives the new ones their ids
 * and prepares their texts and relations, outside the transaction. An
 * excerpt is never about its own parent: it is a part of it.
 */
export async function prepareExcerpts(
  parent: ExcerptParent,
  excerpts: ExcerptItem[] | undefined,
): Promise<PreparedExcerpt[] | undefined> {
  if (excerpts === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const existing = db
    .select({ excerptUuid: schema.excerpts.excerptUuid })
    .from(schema.excerpts)
    .where(parentWhere(schema, parent))
    .all();
  const existingIds = new Set(existing.map((item) => item.excerptUuid));
  const publicIds = excerpts.map((excerpt) => excerpt.publicId);
  if (new Set(publicIds).size !== publicIds.length)
    throw new ExcerptStorageError('Duplicate excerpt public ID');
  if (publicIds.length) {
    const submittedIds = new Set(
      excerpts.map((excerpt) => excerpt.excerptUuid).filter(Boolean),
    );
    const collision = db
      .select({ excerptUuid: schema.excerpts.excerptUuid })
      .from(schema.excerpts)
      .where(inArray(schema.excerpts.publicId, publicIds))
      .all()
      .find((excerpt) => !submittedIds.has(excerpt.excerptUuid));
    if (collision)
      throw new ExcerptStorageError('Excerpt public ID is already taken');
  }
  return prepareProjectContentItems(excerpts, {
    existingIds,
    getId: (excerpt) => excerpt.excerptUuid,
    createId: () =>
      generateUniqueId(
        EntityPrefix.Excerpt,
        async (id) =>
          !db
            .select({ excerptUuid: schema.excerpts.excerptUuid })
            .from(schema.excerpts)
            .where(eq(schema.excerpts.excerptUuid, id))
            .get(),
      ),
    label: 'excerpt',
    prepare: async (excerpt, excerptUuid) => {
      for (const relation of excerpt.relations)
        if (
          relationEndpointsEqual(
            { type: relation.entityType, id: relation.entityId },
            parent,
          )
        )
          throw new ExcerptStorageError(
            'An excerpt is not related to its own parent',
          );
      const contentSave = await prepareContentForSave(
        'excerpt',
        excerptUuid,
        'excerpt-body',
        excerpt.content,
      );
      if (contentSave.type !== 'save')
        throw new ExcerptStorageError('An excerpt needs a text');
      const relations =
        (await prepareRelations(ownerOf(excerptUuid), excerpt.relations)) ?? [];
      return { ...excerpt, excerptUuid, contentSave, relations };
    },
  });
}

/** The relations of an owner as one string, to tell an edit of them. */
function relationFingerprint(tx: any, schema: any, owner: RelationEndpoint) {
  return JSON.stringify(
    relationRowsOf(tx, schema, owner)
      .map((row: any) => [
        row.firstType,
        row.firstId,
        row.secondType,
        row.secondId,
        row.type,
        row.note ?? null,
      ])
      .sort(),
  );
}

export function applyExcerpts(
  tx: any,
  schema: any,
  parent: ExcerptParent,
  excerpts: PreparedExcerpt[] | undefined,
) {
  if (excerpts === undefined) return;
  const existing: ExcerptRow[] = tx
    .select()
    .from(schema.excerpts)
    .where(parentWhere(schema, parent))
    .all();
  const existingById = new Map(existing.map((row) => [row.excerptUuid, row]));
  const removed = projectContentItemIdsToRemove(
    existing.map((row) => row.excerptUuid),
    excerpts.map((excerpt) => excerpt.excerptUuid),
  );
  const banners = readEntityBannerUuids(
    tx,
    schema,
    'excerpt',
    existing.map((row) => row.excerptUuid),
  );
  removeExcerptRows(tx, schema, removed);

  // Public IDs may change hands within one save, and the column is unique
  // at every step: each one that changes is let go before any is taken.
  for (const excerpt of excerpts) {
    const stored = existingById.get(excerpt.excerptUuid);
    if (stored && stored.publicId !== excerpt.publicId)
      tx.update(schema.excerpts)
        .set({ publicId: `~${excerpt.excerptUuid}` })
        .where(eq(schema.excerpts.excerptUuid, excerpt.excerptUuid))
        .run();
  }

  const now = Date.now();
  excerpts.forEach((excerpt, index) => {
    const stored = existingById.get(excerpt.excerptUuid);
    const owner = ownerOf(excerpt.excerptUuid);
    const bannerChanged = syncEntityBanner(
      tx,
      schema,
      'excerpt',
      excerpt.excerptUuid,
      banners.get(excerpt.excerptUuid),
      excerpt.bannerAssetUuid,
    );
    const relationsBefore = stored
      ? relationFingerprint(tx, schema, owner)
      : undefined;
    applyRelations(tx, schema, owner, excerpt.relations);
    const relationsChanged =
      stored !== undefined &&
      relationFingerprint(tx, schema, owner) !== relationsBefore;
    const updatedAt = projectContentItemUpdatedAt(
      stored,
      excerpt,
      excerpt.contentSave,
      now,
      Boolean(stored) && (bannerChanged || relationsChanged),
    );
    tx.insert(schema.excerpts)
      .values({
        excerptUuid: excerpt.excerptUuid,
        parentType: parent.type,
        parentId: parent.id,
        title: excerpt.title,
        summary: excerpt.summary,
        humanReadableSlug: excerpt.humanReadableSlug,
        publicId: excerpt.publicId,
        isPrivate: excerpt.isPrivate,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.excerpts.excerptUuid,
        set: {
          title: excerpt.title,
          summary: excerpt.summary,
          humanReadableSlug: excerpt.humanReadableSlug,
          publicId: excerpt.publicId,
          isPrivate: excerpt.isPrivate,
          sortOrder: index,
          updatedAt,
        },
      })
      .run();
    applyPreparedContentSave(
      tx,
      schema,
      'excerpt',
      excerpt.excerptUuid,
      'excerpt-body',
      excerpt.contentSave,
    );
  });
}

/** Excerpts gone for good: their texts, banners, relations and rows. */
function removeExcerptRows(tx: any, schema: any, ids: string[]) {
  if (!ids.length) return;
  deleteProjectContentItemContent(tx, schema, 'excerpt', ids);
  deleteEntityBanners(tx, schema, 'excerpt', ids);
  for (const id of ids) deleteRelations(tx, schema, ownerOf(id));
  tx.delete(schema.excerpts)
    .where(inArray(schema.excerpts.excerptUuid, ids))
    .run();
}

/** The cascade of a parent's deletion. */
export function deleteExcerptsOfParent(
  tx: any,
  schema: any,
  parent: ExcerptParent,
) {
  const rows: { excerptUuid: string }[] = tx
    .select({ excerptUuid: schema.excerpts.excerptUuid })
    .from(schema.excerpts)
    .where(parentWhere(schema, parent))
    .all();
  removeExcerptRows(
    tx,
    schema,
    rows.map((row) => row.excerptUuid),
  );
}

/**
 * A parent's excerpts in their order, without their texts or relations:
 * what a list, a card or an address reads.
 */
export function listExcerpts(parent: ExcerptParent) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.excerpts)
    .where(parentWhere(schema, parent))
    .orderBy(schema.excerpts.sortOrder)
    .all();
  const banners = readEntityBannerUuids(
    db,
    schema,
    'excerpt',
    rows.map((row) => row.excerptUuid),
  );
  return rows.map((row) => ({
    excerptUuid: row.excerptUuid,
    parentType: row.parentType,
    parentId: row.parentId,
    title: row.title,
    summary: row.summary,
    humanReadableSlug: row.humanReadableSlug,
    publicId: row.publicId,
    isPrivate: row.isPrivate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(banners.has(row.excerptUuid)
      ? { bannerAssetUuid: banners.get(row.excerptUuid) }
      : {}),
  }));
}

export type ExcerptRecord = ReturnType<typeof listExcerpts>[number];

/** One excerpt by its uuid, with its banner, or nothing when it is gone. */
export function findExcerpt(excerptUuid: string): ExcerptRecord | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({
      parentType: schema.excerpts.parentType,
      parentId: schema.excerpts.parentId,
    })
    .from(schema.excerpts)
    .where(eq(schema.excerpts.excerptUuid, excerptUuid))
    .get();
  return (
    row &&
    listExcerpts({ type: row.parentType, id: row.parentId }).find(
      (item) => item.excerptUuid === excerptUuid,
    )
  );
}

/** One excerpt by its public id, with its banner, or nothing. */
export function findExcerptByPublicId(
  publicId: string,
): ExcerptRecord | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({ excerptUuid: schema.excerpts.excerptUuid })
    .from(schema.excerpts)
    .where(eq(schema.excerpts.publicId, publicId))
    .get();
  return row && findExcerpt(row.excerptUuid);
}

/** How many excerpts a parent holds. */
export function countExcerptsOfParent(parent: ExcerptParent): number {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ excerptUuid: schema.excerpts.excerptUuid })
    .from(schema.excerpts)
    .where(parentWhere(schema, parent))
    .all().length;
}

/**
 * A parent's excerpts as its edit form reads them: with their texts, their
 * relations described, and their banners as the form shows them. The times
 * are the server's own record and stay out of the form.
 */
export async function readExcerptsForForm(
  parent: ExcerptParent,
): Promise<ExcerptValue[]> {
  return Promise.all(
    listExcerpts(parent).map(
      async ({
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        parentType: _parentType,
        parentId: _parentId,
        ...excerpt
      }) => {
        const [content, relations, banner] = await Promise.all([
          THEI_SERVER.content.buildFieldValue(
            'excerpt',
            excerpt.excerptUuid,
            'excerpt-body',
          ),
          getRelations(ownerOf(excerpt.excerptUuid)),
          excerpt.bannerAssetUuid
            ? THEI_SERVER.assets.findByUuid(excerpt.bannerAssetUuid)
            : undefined,
        ]);
        const bannerMedia = banner
          ? (await buildAdminAssetUrls(banner)).media
          : undefined;
        return {
          ...excerpt,
          content: content ?? createEmptyContentFieldValue(),
          relations,
          ...(bannerMedia ? { bannerMedia } : {}),
        };
      },
    ),
  );
}

/** The identities a save assigned, for the form's next save. */
export function excerptIdentities(
  excerpts: PreparedExcerpt[] | undefined,
): ProjectContentItemIdentity[] {
  return projectContentItemIdentities(
    excerpts,
    (excerpt) => excerpt.excerptUuid,
    (excerpt) => excerpt.publicId,
  );
}

/**
 * What becomes of the excerpts about an entity when it is deleted: they
 * stay, without this one relation (an excerpt left with none is marked in
 * its parent's form until the owner relates it to something else), or they
 * go with it, texts, banners and all.
 */
export type ExcerptsOnTargetDelete = 'keep' | 'delete';

export function excerptsOnTargetDeleteOf(
  value: unknown,
): ExcerptsOnTargetDelete {
  return value === 'delete' ? 'delete' : 'keep';
}

/** The relation rows joining a target to excerpts, with the excerpt's id. */
export function excerptRelationRowsOf(
  db: any,
  schema: any,
  target: RelationEndpoint,
): { excerptUuid: string; row: any }[] {
  const rows = db
    .select()
    .from(schema.entityRelations)
    .where(
      or(
        and(
          eq(schema.entityRelations.firstType, target.type),
          eq(schema.entityRelations.firstId, target.id),
          eq(schema.entityRelations.secondType, 'excerpt'),
        ),
        and(
          eq(schema.entityRelations.secondType, target.type),
          eq(schema.entityRelations.secondId, target.id),
          eq(schema.entityRelations.firstType, 'excerpt'),
        ),
      ),
    )
    .all();
  return rows.map((row: any) => ({
    excerptUuid: row.firstType === 'excerpt' ? row.firstId : row.secondId,
    row,
  }));
}

/**
 * Takes a target that is being deleted off the excerpts about it, the way
 * the owner chose. Runs inside the deletion's transaction, before the
 * target's own relations go.
 */
export function detachExcerptsFromTarget(
  tx: any,
  schema: any,
  target: RelationEndpoint,
  mode: ExcerptsOnTargetDelete,
): string[] {
  const joined = excerptRelationRowsOf(tx, schema, target);
  const ids = [...new Set(joined.map((item) => item.excerptUuid))];
  if (!ids.length) return ids;
  if (mode === 'delete') {
    removeExcerptRows(tx, schema, ids);
    return ids;
  }
  for (const { row } of joined)
    tx.delete(schema.entityRelations)
      .where(
        and(
          eq(schema.entityRelations.firstType, row.firstType),
          eq(schema.entityRelations.firstId, row.firstId),
          eq(schema.entityRelations.secondType, row.secondType),
          eq(schema.entityRelations.secondId, row.secondId),
        ),
      )
      .run();
  for (const id of ids) touchRelationEndpoint(tx, schema, ownerOf(id));
  return ids;
}

/**
 * How many excerpts are about an entity, and for how many of them it is the
 * only thing they are about: what the deletion pane says before asking.
 */
export function countExcerptsOfTarget(target: RelationEndpoint): {
  related: number;
  onlyTarget: number;
} {
  const { db, schema } = THEI_SERVER.useDb();
  const ids = [
    ...new Set(
      excerptRelationRowsOf(db, schema, target).map((item) => item.excerptUuid),
    ),
  ];
  const onlyTarget = ids.filter(
    (id) => relationRowsOf(db, schema, ownerOf(id)).length === 1,
  ).length;
  return { related: ids.length, onlyTarget };
}

/** The key the deletion pane and the forms name a target by. */
export function excerptTargetKey(target: RelationEndpoint) {
  return relationEndpointKey(target);
}
