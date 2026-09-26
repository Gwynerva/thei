import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import {
  cleanTagTitle,
  normalizeTagTitle,
  TAG_TITLE_MAX_LENGTH,
  type TagContainerType,
  type TagEditItem,
  type TagItem,
  type TagSaveErrorCode,
} from '#layers/thei/shared/tag';
import { buildAdminAssetUrls } from './assets/urls';
import { EntityPrefix, generateUniqueId } from './entity-id';

export async function listTagsForContainer(
  containerType: TagContainerType,
  containerId: string,
): Promise<TagItem[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({ tag: schema.tags })
    .from(schema.tagUsages)
    .innerJoin(schema.tags, eq(schema.tags.tagUuid, schema.tagUsages.tagUuid))
    .where(
      and(
        eq(schema.tagUsages.containerType, containerType),
        eq(schema.tagUsages.containerId, containerId),
      ),
    )
    .orderBy(asc(schema.tagUsages.sortOrder))
    .all();
  return buildTagItems(rows.map(({ tag }) => tag));
}

type TagRow = typeof import('./db/schema/tags').tags.$inferSelect;

export function isTagUuid(value: string): boolean {
  return /^t-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function findTagConflict(
  data: Pick<TagRow, 'normalizedTitle' | 'slug' | 'publicId'>,
  excludeTagUuid?: string,
): TagSaveErrorCode | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const conflicts = [
    ['title-taken', schema.tags.normalizedTitle, data.normalizedTitle],
    ['slug-taken', schema.tags.slug, data.slug],
    ['public-id-taken', schema.tags.publicId, data.publicId],
  ] as const;
  for (const [code, column, value] of conflicts) {
    const condition = excludeTagUuid
      ? and(eq(column, value), ne(schema.tags.tagUuid, excludeTagUuid))
      : eq(column, value);
    if (
      db
        .select({ tagUuid: schema.tags.tagUuid })
        .from(schema.tags)
        .where(condition)
        .get()
    )
      return code;
  }
}

export function tagConflictMessage(code: TagSaveErrorCode): string {
  if (code === 'title-taken') return THEI_SERVER.phrase.tag_title_taken;
  if (code === 'slug-taken') return THEI_SERVER.phrase.tag_slug_taken;
  return THEI_SERVER.phrase.tag_public_id_taken;
}

export async function buildTagItems(tags: TagRow[]): Promise<TagItem[]> {
  if (!tags.length) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const iconRows = db
    .select({ usage: schema.assetUsages, asset: schema.assets })
    .from(schema.assetUsages)
    .innerJoin(
      schema.assets,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      and(
        eq(schema.assetUsages.containerType, 'tag'),
        eq(schema.assetUsages.role, 'icon'),
        inArray(
          schema.assetUsages.containerId,
          tags.map((tag) => tag.tagUuid),
        ),
      ),
    )
    .all();
  const icons = new Map(iconRows.map((row) => [row.usage.containerId, row]));

  return Promise.all(
    tags.map(async (tag) => {
      const icon = icons.get(tag.tagUuid);
      const urls = icon ? await buildAdminAssetUrls(icon.asset) : undefined;
      return {
        tagUuid: tag.tagUuid,
        title: tag.title,
        slug: tag.slug,
        publicId: tag.publicId,
        description: tag.description || undefined,
        iconAssetUuid: icon?.asset.assetUuid,
        iconMedia: urls?.media,
        iconAssetSize: icon?.asset.size,
      };
    }),
  );
}

export async function buildTagItem(tag: TagRow): Promise<TagItem> {
  return (await buildTagItems([tag]))[0]!;
}

/**
 * A tag the save will place: an existing one by identity, or a new one with
 * everything its row needs. Its slug and public ID are only proposals — the
 * transaction settles them against whatever exists by then.
 */
export type PreparedTagUsage =
  | { tagUuid: string; create?: undefined }
  | {
      tagUuid: string;
      create: {
        title: string;
        normalizedTitle: string;
        slug: string;
        publicId: string;
      };
    };

/**
 * Resolves the tags of a save before its transaction opens.
 *
 * A title that already names a tag becomes that tag, and each tag is placed
 * once however many items resolve to it: a tag renamed in another tab and
 * then typed again by its new name is still one tag.
 */
export async function prepareTagUsages(
  items: TagEditItem[] | undefined,
): Promise<PreparedTagUsage[] | undefined> {
  if (items === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const findTag = (condition: SQL) =>
    db
      .select({ tagUuid: schema.tags.tagUuid })
      .from(schema.tags)
      .where(condition)
      .get();
  const prepared: PreparedTagUsage[] = [];
  const placed = new Set<string>();
  const place = (item: PreparedTagUsage, identity = item.tagUuid) => {
    if (placed.has(identity)) return;
    placed.add(identity);
    prepared.push(item);
  };
  for (const item of items) {
    if (item.tagUuid) {
      const existing = findTag(eq(schema.tags.tagUuid, item.tagUuid));
      if (!existing) throw new Error('Tag not found');
      place({ tagUuid: existing.tagUuid });
      continue;
    }
    const title = cleanTagTitle(item.title);
    if (!title || title.length > TAG_TITLE_MAX_LENGTH)
      throw new Error('Invalid tag title');
    const normalizedTitle = normalizeTagTitle(title);
    const existing = findTag(eq(schema.tags.normalizedTitle, normalizedTitle));
    if (existing) {
      place({ tagUuid: existing.tagUuid });
      continue;
    }
    if (placed.has(`new:${normalizedTitle}`)) continue;
    const tagUuid = await generateUniqueId(
      EntityPrefix.Tag,
      async (id) => !findTag(eq(schema.tags.tagUuid, id)),
    );
    place(
      {
        tagUuid,
        create: {
          title,
          normalizedTitle,
          slug: THEI_SERVER.language.slugify(title) || 'tag',
          publicId: randomTagPublicId(),
        },
      },
      `new:${normalizedTitle}`,
    );
  }
  return prepared;
}

export function applyTagUsages(
  tx: any,
  schema: any,
  containerType: TagContainerType,
  containerId: string,
  prepared: PreparedTagUsage[] | undefined,
) {
  if (prepared === undefined) return;
  const oldTagUuids = tx
    .select({ tagUuid: schema.tagUsages.tagUuid })
    .from(schema.tagUsages)
    .where(
      and(
        eq(schema.tagUsages.containerType, containerType),
        eq(schema.tagUsages.containerId, containerId),
      ),
    )
    .all()
    .map((row: { tagUuid: string }) => row.tagUuid);
  tx.delete(schema.tagUsages)
    .where(
      and(
        eq(schema.tagUsages.containerType, containerType),
        eq(schema.tagUsages.containerId, containerId),
      ),
    )
    .run();
  const placed = new Set<string>();
  for (const item of prepared) {
    const tagUuid = item.create
      ? createPreparedTag(tx, schema, item.tagUuid, item.create)
      : item.tagUuid;
    // Another request may have created the same new tag in the meantime.
    if (placed.has(tagUuid)) continue;
    tx.insert(schema.tagUsages)
      .values({
        tagUuid,
        containerType,
        containerId,
        sortOrder: placed.size,
      })
      .run();
    placed.add(tagUuid);
  }
  cleanupSimpleOrphanTags(tx, schema, oldTagUuids);
}

/**
 * Inserts a tag prepared outside the transaction and returns the identity it
 * ends up with: its own, or that of a tag another request created with the
 * same title in the meantime. A slug or public ID taken since is moved aside.
 */
function createPreparedTag(
  tx: any,
  schema: any,
  tagUuid: string,
  create: Extract<PreparedTagUsage, { create: object }>['create'],
): string {
  const taken = (column: any, value: string) =>
    Boolean(
      tx
        .select({ tagUuid: schema.tags.tagUuid })
        .from(schema.tags)
        .where(eq(column, value))
        .get(),
    );
  let slug = create.slug;
  let publicId = create.publicId;
  for (let suffix = 2; suffix < 102; suffix++) {
    tx.insert(schema.tags)
      .values({ tagUuid, ...create, slug, publicId })
      .onConflictDoNothing()
      .run();
    const actual = tx
      .select({ tagUuid: schema.tags.tagUuid })
      .from(schema.tags)
      .where(eq(schema.tags.normalizedTitle, create.normalizedTitle))
      .get();
    if (actual) return actual.tagUuid;
    if (taken(schema.tags.slug, slug)) slug = `${create.slug}-${suffix}`;
    if (taken(schema.tags.publicId, publicId)) publicId = randomTagPublicId();
  }
  throw new Error('Failed to create tag');
}

export function deleteTagUsagesForContainer(
  tx: any,
  schema: any,
  containerType: TagContainerType,
  containerId: string,
) {
  const tagUuids = tx
    .select({ tagUuid: schema.tagUsages.tagUuid })
    .from(schema.tagUsages)
    .where(
      and(
        eq(schema.tagUsages.containerType, containerType),
        eq(schema.tagUsages.containerId, containerId),
      ),
    )
    .all()
    .map((row: { tagUuid: string }) => row.tagUuid);
  tx.delete(schema.tagUsages)
    .where(
      and(
        eq(schema.tagUsages.containerType, containerType),
        eq(schema.tagUsages.containerId, containerId),
      ),
    )
    .run();
  cleanupSimpleOrphanTags(tx, schema, tagUuids);
}

function cleanupSimpleOrphanTags(tx: any, schema: any, tagUuids: string[]) {
  for (const tagUuid of new Set(tagUuids)) {
    const usage = tx
      .select({ count: sql<number>`count(*)` })
      .from(schema.tagUsages)
      .where(eq(schema.tagUsages.tagUuid, tagUuid))
      .get();
    if (Number(usage?.count ?? 0) > 0) continue;
    const tag = tx
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.tagUuid, tagUuid))
      .get();
    if (!tag || tag.description) continue;
    const icon = tx
      .select({ assetUuid: schema.assetUsages.assetUuid })
      .from(schema.assetUsages)
      .where(
        and(
          eq(schema.assetUsages.containerType, 'tag'),
          eq(schema.assetUsages.containerId, tagUuid),
          eq(schema.assetUsages.role, 'icon'),
        ),
      )
      .get();
    if (!icon)
      tx.delete(schema.tags).where(eq(schema.tags.tagUuid, tagUuid)).run();
  }
}

export function randomTagPublicId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 14);
}

/**
 * Puts a tag on one more project or event, after the tags it already has.
 * Placing a tag that is already there changes nothing. Returns false when the
 * entity does not exist.
 */
export function addTagUsage(
  tagUuid: string,
  containerType: TagContainerType,
  containerId: string,
): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  return db.transaction((tx) => {
    const usages = tx
      .select({
        tagUuid: schema.tagUsages.tagUuid,
        sortOrder: schema.tagUsages.sortOrder,
      })
      .from(schema.tagUsages)
      .where(
        and(
          eq(schema.tagUsages.containerType, containerType),
          eq(schema.tagUsages.containerId, containerId),
        ),
      )
      .all();
    if (usages.some((usage) => usage.tagUuid === tagUuid)) return true;
    // A tag changes the entity's page, so it is touched as any save would;
    // touching nothing means there is no such entity.
    const touched =
      containerType === 'project'
        ? tx
            .update(schema.projects)
            .set({ updatedAt: now })
            .where(eq(schema.projects.projectUuid, containerId))
            .run()
        : tx
            .update(schema.events)
            .set({ updatedAt: now })
            .where(eq(schema.events.eventUuid, containerId))
            .run();
    if (!touched.changes) return false;
    tx.insert(schema.tagUsages)
      .values({
        tagUuid,
        containerType,
        containerId,
        sortOrder: Math.max(-1, ...usages.map((usage) => usage.sortOrder)) + 1,
      })
      .run();
    return true;
  });
}
