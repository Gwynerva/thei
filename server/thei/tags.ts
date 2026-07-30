import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  normalizeTagTitle,
  type TagEditItem,
  type TagItem,
  type TagSaveErrorCode,
} from '#layers/thei/shared/tag';
import { buildAdminAssetUrls } from './assets/urls';
import { EntityPrefix, generateUniqueId } from './entity-id';

export async function listTagsForContainer(
  containerType: 'project' | 'event',
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
    if (db.select({ tagUuid: schema.tags.tagUuid }).from(schema.tags).where(condition).get())
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
        accentColor: tag.accentColor || undefined,
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

export async function prepareTagUsages(items: TagEditItem[] | undefined) {
  if (items === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const prepared: Array<{ tagUuid: string; title?: string; normalizedTitle?: string; slug?: string; publicId?: string }> = [];
  const reservedSlugs = new Set<string>();
  const reservedPublicIds = new Set<string>();
  for (const item of items) {
    if (item.tagUuid) {
      const existing = await db.query.tags.findFirst({
        where: eq(schema.tags.tagUuid, item.tagUuid),
      });
      if (!existing) throw new Error('Tag not found');
      prepared.push({ tagUuid: existing.tagUuid });
      continue;
    }
    const title = item.title.trim();
    if (!title || title.length > 100) throw new Error('Invalid tag title');
    const normalizedTitle = normalizeTagTitle(title);
    const existing = await db.query.tags.findFirst({
      where: eq(schema.tags.normalizedTitle, normalizedTitle),
    });
    if (existing) {
      prepared.push({ tagUuid: existing.tagUuid });
      continue;
    }
    const tagUuid = await generateUniqueId(
      EntityPrefix.Tag,
      async (id) => !(await db.query.tags.findFirst({ where: eq(schema.tags.tagUuid, id) })),
    );
    const language = THEI_SERVER.language;
    let slug = language.slugify(title) || 'tag';
    const originalSlug = slug;
    let suffix = 2;
    while (
      reservedSlugs.has(slug) ||
      (await db.query.tags.findFirst({ where: eq(schema.tags.slug, slug) }))
    ) {
      slug = `${originalSlug}-${suffix++}`;
    }
    reservedSlugs.add(slug);
    let publicId = randomTagPublicId();
    while (
      reservedPublicIds.has(publicId) ||
      (await db.query.tags.findFirst({ where: eq(schema.tags.publicId, publicId) }))
    ) {
      publicId = randomTagPublicId();
    }
    reservedPublicIds.add(publicId);
    prepared.push({
      tagUuid,
      title,
      normalizedTitle,
      slug,
      publicId,
    });
  }
  return prepared;
}

export function applyTagUsages(
  tx: any,
  schema: any,
  containerType: 'project' | 'event',
  containerId: string,
  prepared: Awaited<ReturnType<typeof prepareTagUsages>>,
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
  prepared.forEach((item, sortOrder) => {
    if (item.title) {
      const originalSlug = item.slug!;
      let suffix = 2;
      let actual: { tagUuid: string } | undefined;
      for (let attempt = 0; attempt < 100 && !actual; attempt++) {
        tx.insert(schema.tags)
          .values({
            tagUuid: item.tagUuid,
            title: item.title,
            normalizedTitle: item.normalizedTitle,
            slug: item.slug,
            publicId: item.publicId,
          })
          .onConflictDoNothing()
          .run();
        actual = tx
          .select({ tagUuid: schema.tags.tagUuid })
          .from(schema.tags)
          .where(eq(schema.tags.normalizedTitle, item.normalizedTitle))
          .get();
        if (actual) break;
        if (
          tx
            .select({ tagUuid: schema.tags.tagUuid })
            .from(schema.tags)
            .where(eq(schema.tags.slug, item.slug))
            .get()
        )
          item.slug = `${originalSlug}-${suffix++}`;
        if (
          tx
            .select({ tagUuid: schema.tags.tagUuid })
            .from(schema.tags)
            .where(eq(schema.tags.publicId, item.publicId))
            .get()
        )
          item.publicId = randomTagPublicId();
      }
      if (!actual) throw new Error('Failed to create tag');
      item.tagUuid = actual.tagUuid;
    }
    tx.insert(schema.tagUsages)
      .values({ tagUuid: item.tagUuid, containerType, containerId, sortOrder })
      .run();
  });
  cleanupSimpleOrphanTags(tx, schema, oldTagUuids);
}

export function deleteTagUsagesForContainer(
  tx: any,
  schema: any,
  containerType: 'project' | 'event',
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
    if (!tag || tag.description || tag.accentColor) continue;
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
    if (!icon) tx.delete(schema.tags).where(eq(schema.tags.tagUuid, tagUuid)).run();
  }
}

export function randomTagPublicId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 14);
}
