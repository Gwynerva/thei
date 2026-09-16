import {
  AssetType,
  type ContentAssetUsageMeta,
} from '#layers/thei/shared/asset';
import {
  ContentValidationError,
  collectContentAssetUuids,
  contentBlockIsInPrivateSection,
  contentBlockIsPrivate,
  contentPrivateSectionRanges,
  normalizeContentData,
  summarizeContentData,
  type ContentOutputBlock,
  type ContentOutputData,
  type ContentOwnerType,
  type ContentSlot,
  type PublicContentOutputBlock,
  type PublicContentOutputData,
} from '#layers/thei/shared/content';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import {
  archivedOriginalFromMeta,
  buildPublicEventContentMedia,
  buildPublicProjectContentMedia,
  buildPublicPageContentMedia,
  buildPublicProfileMedia,
} from '../assets/urls';
import { findExternalLink } from '../external-links/repository';
import { canResolveContentEntityLink } from '../content-links/access';
import {
  isContentEntityType,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';

/**
 * Canonical shape `normalizeContentInlineHtml` writes entity anchors in, so
 * rewriting them is an exact match rather than HTML parsing.
 */
const INLINE_ENTITY_ANCHOR =
  /<a data-content-link="entity" data-entity-type="(project|event|page)" data-entity-id="([^"]*)">/g;

type EntityLinkAccess = 'resolvable' | 'restricted' | 'missing';

type PublicContentEntity =
  | { type: 'profile'; title?: string }
  | {
      type: 'event';
      title?: string;
      humanReadableSlug: string;
      publicId: string;
    }
  | {
      type: 'project';
      title?: string;
      humanReadableSlug: string;
      publicId: string;
    }
  | {
      type: 'page';
      title?: string;
      slug: string;
    };

export async function buildPublicContentData(
  ownerType: ContentOwnerType,
  ownerId: string,
  slot: ContentSlot,
  entity: PublicContentEntity,
  includePrivate = false,
): Promise<PublicContentOutputData | undefined> {
  const row = await THEI_SERVER.content.findByOwner(ownerType, ownerId, slot);
  if (!row) return undefined;
  try {
    return await hydratePublicContentData(
      row.data,
      entity,
      row.contentUuid,
      includePrivate,
    );
  } catch (error) {
    if (error instanceof ContentValidationError) return { blocks: [] };
    throw error;
  }
}

export async function buildPublicContentPreviewMedia(
  ownerType: ContentOwnerType,
  ownerId: string,
  slot: ContentSlot,
  entity: PublicContentEntity,
  includePrivate = false,
): Promise<MediaDescriptor | undefined> {
  const row = await THEI_SERVER.content.findByOwner(ownerType, ownerId, slot);
  if (!row) return undefined;

  for (const assetUuid of selectPublicContentMediaAssetUuids(
    row.data,
    includePrivate,
  )) {
    if (
      !(await contentAssetHasPublicReference(
        row.contentUuid,
        assetUuid,
        includePrivate,
      ))
    )
      continue;
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (
      !asset ||
      (asset.type !== AssetType.Image && asset.type !== AssetType.Video)
    )
      continue;
    return entity.type === 'profile'
      ? buildPublicProfileMedia(asset, 'profile', 'profile', 'content')
      : entity.type === 'event'
        ? buildPublicEventContentMedia(entity, asset)
        : entity.type === 'page'
          ? buildPublicPageContentMedia(entity, asset)
          : buildPublicProjectContentMedia(entity, asset);
  }
  return undefined;
}

export function selectPublicContentMediaAssetUuids(
  value: ContentOutputData,
  includePrivate = false,
) {
  const normalized = normalizeContentData(value);
  const privateSectionRanges = contentPrivateSectionRanges(normalized);
  const assetUuids: string[] = [];
  const seen = new Set<string>();
  const append = (value: unknown) => {
    const assetUuid = (value as any)?.assetUuid;
    if (typeof assetUuid !== 'string' || !assetUuid || seen.has(assetUuid))
      return;
    seen.add(assetUuid);
    assetUuids.push(assetUuid);
  };
  for (const [index, block] of normalized.blocks.entries()) {
    if (block.type === 'privateSectionBoundary') continue;
    if (
      !includePrivate &&
      (contentBlockIsPrivate(block) ||
        contentBlockIsInPrivateSection(privateSectionRanges, index))
    )
      continue;
    if (block.type === 'contentMedia') append((block.data as any).asset);
    if (block.type === 'contentGallery') {
      const items = Array.isArray((block.data as any).items)
        ? (block.data as any).items
        : [];
      items.forEach((item: any) => append(item?.asset));
    }
  }
  return assetUuids;
}

async function hydratePublicContentData(
  value: ContentOutputData,
  entity: PublicContentEntity,
  contentUuid: string,
  includePrivate: boolean,
): Promise<PublicContentOutputData> {
  const normalized = normalizeContentData(value);
  const privateSectionRanges = contentPrivateSectionRanges(normalized);
  const sectionByStartIndex = new Map(
    privateSectionRanges.map((range) => [range.startIndex, range]),
  );
  const assetCache = new Map<string, any>();
  const linkCache = new Map<
    string,
    Awaited<ReturnType<typeof findExternalLink>>
  >();
  const entityLinkCache = new Map<string, EntityLinkAccess>();

  /**
   * A link to an entity the reader may not open carries that entity's uuid,
   * which would otherwise travel in the payload of a page anyone can read and
   * make `/api/content-links` answer for it. `missing` is left alone: a uuid
   * that resolves to nothing discloses nothing, and collapsing it into
   * `restricted` would show a lock where the author left a dead link.
   */
  async function entityLinkAccess(
    entityType: ContentEntityType,
    entityId: string,
  ): Promise<EntityLinkAccess> {
    const key = `${entityType}:${entityId}`;
    const cached = entityLinkCache.get(key);
    if (cached) return cached;
    const entity =
      entityType === 'project'
        ? await THEI_SERVER.projects.findByUuid(entityId)
        : entityType === 'event'
          ? await THEI_SERVER.events.findByUuid(entityId)
          : await THEI_SERVER.pages.findByUuid(entityId);
    const access: EntityLinkAccess = !entity
      ? 'missing'
      : canResolveContentEntityLink(entity.access, includePrivate)
        ? 'resolvable'
        : 'restricted';
    entityLinkCache.set(key, access);
    return access;
  }

  /** Same redaction for entity links written inline inside rich text. */
  async function redactInlineEntityLinks(html: string): Promise<string> {
    const restricted = new Set<string>();
    for (const [, entityType, entityId] of html.matchAll(
      INLINE_ENTITY_ANCHOR,
    )) {
      if (!isContentEntityType(entityType)) continue;
      if ((await entityLinkAccess(entityType, entityId!)) === 'restricted')
        restricted.add(`${entityType}:${entityId}`);
    }
    if (!restricted.size) return html;
    return html.replace(INLINE_ENTITY_ANCHOR, (source, type, id) =>
      restricted.has(`${type}:${id}`)
        ? `<a data-content-link="entity" data-entity-type="${type}" data-entity-restricted="true">`
        : source,
    );
  }

  async function redactBlockData(value: unknown): Promise<unknown> {
    if (typeof value === 'string')
      return value.includes('<a data-content-link="entity"')
        ? await redactInlineEntityLinks(value)
        : value;
    if (Array.isArray(value))
      return await Promise.all(value.map(redactBlockData));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, item]) => [
            key,
            await redactBlockData(item),
          ]),
        ),
      );
    return value;
  }

  async function hydrateAsset(assetUuid: string) {
    if (assetCache.has(assetUuid)) return assetCache.get(assetUuid);
    if (
      !(await contentAssetHasPublicReference(
        contentUuid,
        assetUuid,
        includePrivate,
      ))
    )
      return undefined;
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (!asset) return undefined;
    const baseUrl =
      entity.type === 'profile'
        ? `/profile/media/profile/profile/content/${asset.slug}.${asset.extension}`
        : entity.type === 'event'
          ? `${buildEventUrl(entity.humanReadableSlug, entity.publicId)}content/${asset.slug}.${asset.extension}`
          : entity.type === 'page'
            ? `${buildPageUrl(entity.slug)}content/${asset.slug}.${asset.extension}`
            : `${buildProjectUrl(entity.humanReadableSlug, entity.publicId)}content/${asset.slug}.${asset.extension}`;
    const media =
      asset.type === AssetType.Image || asset.type === AssetType.Video
        ? entity.type === 'profile'
          ? await buildPublicProfileMedia(
              asset,
              'profile',
              'profile',
              'content',
            )
          : entity.type === 'event'
            ? await buildPublicEventContentMedia(entity, asset)
            : entity.type === 'page'
              ? await buildPublicPageContentMedia(entity, asset)
              : await buildPublicProjectContentMedia(entity, asset)
        : undefined;
    const hydrated = {
      // Public renderers only need a stable local key. Never expose the
      // storage UUID through public content responses.
      assetUuid: asset.slug,
      type: asset.type,
      extension: asset.extension,
      size: asset.size,
      media,
      assetUrl: baseUrl,
      archivedOriginal:
        asset.type === AssetType.Other
          ? archivedOriginalFromMeta(asset.meta)
          : undefined,
    };
    assetCache.set(assetUuid, hydrated);
    return hydrated;
  }

  async function hydrateBlock(
    block: ContentOutputBlock,
  ): Promise<ContentOutputBlock> {
    const data = { ...block.data };
    if (block.type === 'entityLink') {
      const entityType = data.entityType;
      const entityId = data.entityId;
      if (
        isContentEntityType(entityType) &&
        typeof entityId === 'string' &&
        entityId &&
        (await entityLinkAccess(entityType, entityId)) === 'restricted'
      )
        return { ...block, data: { entityType, restricted: true } };
    } else if (
      block.type === 'contentMedia' ||
      block.type === 'contentAttachment'
    ) {
      const assetUuid = (block.data as any).asset?.assetUuid;
      data.asset = assetUuid ? await hydrateAsset(assetUuid) : null;
    } else if (block.type === 'contentGallery') {
      const items = Array.isArray((block.data as any).items)
        ? (block.data as any).items
        : [];
      data.items = (
        await Promise.all(
          items.map(async (item: any) => {
            const asset = item?.asset?.assetUuid
              ? await hydrateAsset(item.asset.assetUuid)
              : undefined;
            return asset ? { ...item, asset } : undefined;
          }),
        )
      ).filter(Boolean);
    } else if (block.type === 'externalLink') {
      const url = (block.data as any).url;
      let link = url ? linkCache.get(url) : undefined;
      if (url && !linkCache.has(url)) {
        link = await findExternalLink(url);
        linkCache.set(url, link);
      }
      if (link) Object.assign(data, link);
    }
    return {
      ...block,
      data: includePrivate
        ? data
        : ((await redactBlockData(data)) as typeof data),
    };
  }

  async function privateSectionSummary(blocks: ContentOutputBlock[]) {
    const assets = await Promise.all(
      collectContentAssetUuids({ blocks }).map((assetUuid) =>
        THEI_SERVER.assets.findByUuid(assetUuid),
      ),
    );
    return summarizeContentData(
      { blocks },
      new Map(
        assets
          .filter((asset) => asset !== undefined)
          .map((asset) => [asset.assetUuid, asset.size]),
      ),
    );
  }

  const blocks: PublicContentOutputBlock[] = [];
  for (let index = 0; index < normalized.blocks.length; index++) {
    const range = sectionByStartIndex.get(index);
    if (range) {
      const innerBlocks = normalized.blocks.slice(
        range.startIndex + 1,
        range.endIndex,
      );
      const summary = await privateSectionSummary(innerBlocks);
      if (includePrivate) {
        blocks.push({
          type: 'privateSectionExpanded',
          data: {
            summary,
            blocks: await Promise.all(innerBlocks.map(hydrateBlock)),
          },
        });
      } else {
        blocks.push({ type: 'privateSectionPlaceholder', data: summary });
      }
      index = range.endIndex;
      continue;
    }

    const block = normalized.blocks[index]!;
    if (block.type === 'privateSectionBoundary') continue;
    if (!includePrivate && contentBlockIsPrivate(block)) continue;
    blocks.push(await hydrateBlock(block));
  }
  return { ...normalized, blocks };
}

export async function contentAssetHasPublicReference(
  contentUuid: string,
  assetUuid: string,
  includePrivate: boolean,
) {
  const usage = await THEI_SERVER.assets.usages.findOne(
    assetUuid,
    'content',
    contentUuid,
    'content',
  );
  if (!usage) return false;
  if (includePrivate) return true;
  const meta = usage.meta as ContentAssetUsageMeta | null;
  return Boolean(
    meta?.role === 'content' &&
    meta.refs.some((reference) => !reference.isPrivate),
  );
}
