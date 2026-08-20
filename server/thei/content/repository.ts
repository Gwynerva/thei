import { and, eq } from 'drizzle-orm';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  canonicalizeContentData,
  collectContentExternalLinkUrls,
  ContentValidationError,
  extractContentAssetRefs,
  isContentAssetBlockType,
  normalizeContentData,
  summarizeContentData,
  type ContentEditValue,
  type ContentFieldValue,
  type ContentOutputBlock,
  type ContentOutputData,
  type ContentOwnerType,
  type ContentSlot,
} from '#layers/thei/shared/content';
import {
  AssetType,
  assetSourceName,
  type ContentAssetUsageMeta,
} from '#layers/thei/shared/asset';
import { buildAdminAssetUrls, archivedOriginalFromMeta } from '../assets/urls';
import { findExternalLink } from '../external-links/repository';
import { persistExternalLink } from '../external-links/preview';

export async function findContentByOwner(
  ownerType: ContentOwnerType,
  ownerId: string,
  slot: ContentSlot,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return await db.query.content.findFirst({
    where: and(
      eq(schema.content.ownerType, ownerType),
      eq(schema.content.ownerId, ownerId),
      eq(schema.content.slot, slot),
    ),
  });
}

export async function contentExists(contentUuid: string): Promise<boolean> {
  const { db, schema } = THEI_SERVER.useDb();
  const row = await db.query.content.findFirst({
    columns: { contentUuid: true },
    where: eq(schema.content.contentUuid, contentUuid),
  });
  return Boolean(row);
}

export async function buildContentFieldValue(
  ownerType: ContentOwnerType,
  ownerId: string,
  slot: ContentSlot,
): Promise<ContentFieldValue | undefined> {
  const row = await findContentByOwner(ownerType, ownerId, slot);
  if (!row) return undefined;
  const data = await hydrateContentData(row.data);

  return {
    contentUuid: row.contentUuid,
    data,
    blockCount: row.blockCount,
    wordCount: summarizeContentData(data).wordCount,
    assetCount: row.assetCount,
    assetTotalSize: row.assetTotalSize,
    updatedAt: row.updatedAt,
  };
}

export async function prepareContentForSave(
  ownerType: ContentOwnerType,
  ownerId: string,
  slot: ContentSlot,
  value: ContentEditValue | null | undefined,
): Promise<
  | {
      type: 'delete';
      existingContentUuid?: string;
    }
  | {
      type: 'save';
      contentUuid: string;
      data: ContentOutputData;
      blockCount: number;
      wordCount: number;
      assetCount: number;
      assetTotalSize: number;
      assetUsages: PreparedContentAssetUsage[];
    }
> {
  const existing = await findContentByOwner(ownerType, ownerId, slot);
  const data = canonicalizeContentData(value?.data);

  if (data.blocks.length === 0) {
    return { type: 'delete', existingContentUuid: existing?.contentUuid };
  }

  const assetRows = await validateContentAssets(data);
  await persistMissingContentExternalLinks(data);
  const summary = summarizeContentData(
    data,
    new Map(assetRows.map((asset) => [asset.assetUuid, asset.size])),
  );
  const contentUuid =
    existing?.contentUuid ??
    (await generateUniqueId(EntityPrefix.Content, async (id) => {
      return !(await contentExists(id));
    }));

  return {
    type: 'save',
    contentUuid,
    data,
    ...summary,
    assetUsages: buildPreparedAssetUsages(contentUuid, data),
  };
}

async function persistMissingContentExternalLinks(data: ContentOutputData) {
  const urls = collectContentExternalLinkUrls(data);
  await Promise.all(
    urls.map(async (url) => {
      try {
        if (!(await findExternalLink(url))) await persistExternalLink(url);
      } catch (error) {
        THEI_SERVER.console
          .tag('External links')
          .warn(`Failed to persist content preview for ${url}`, error);
      }
    }),
  );
}

export type PreparedContentSave = Awaited<
  ReturnType<typeof prepareContentForSave>
>;

export interface PreparedContentAssetUsage {
  assetUuid: string;
  contentUuid: string;
  meta: ContentAssetUsageMeta;
}

export function applyPreparedContentSave(
  tx: any,
  schema: any,
  ownerType: ContentOwnerType,
  ownerId: string,
  slot: ContentSlot,
  prepared: PreparedContentSave,
) {
  if (prepared.type === 'delete') {
    if (!prepared.existingContentUuid) return;
    deleteContentRowAndUsages(tx, schema, prepared.existingContentUuid);
    return;
  }

  const now = Date.now();
  tx.insert(schema.content)
    .values({
      contentUuid: prepared.contentUuid,
      ownerType,
      ownerId,
      slot,
      data: prepared.data,
      blockCount: prepared.blockCount,
      assetCount: prepared.assetCount,
      assetTotalSize: prepared.assetTotalSize,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.content.ownerType,
        schema.content.ownerId,
        schema.content.slot,
      ],
      set: {
        data: prepared.data,
        blockCount: prepared.blockCount,
        assetCount: prepared.assetCount,
        assetTotalSize: prepared.assetTotalSize,
        updatedAt: now,
      },
    })
    .run();

  tx.delete(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.containerType, 'content'),
        eq(schema.assetUsages.containerId, prepared.contentUuid),
      ),
    )
    .run();

  for (const usage of prepared.assetUsages) {
    tx.insert(schema.assetUsages)
      .values({
        assetUuid: usage.assetUuid,
        containerType: 'content',
        containerId: usage.contentUuid,
        role: 'content',
        meta: usage.meta,
      })
      .run();
    tx.update(schema.assets)
      .set({ touchedAt: now })
      .where(eq(schema.assets.assetUuid, usage.assetUuid))
      .run();
  }
}

export function deleteContentForOwner(
  tx: any,
  schema: any,
  ownerType: ContentOwnerType,
  ownerId: string,
) {
  const rows = tx
    .select({ contentUuid: schema.content.contentUuid })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, ownerType),
        eq(schema.content.ownerId, ownerId),
      ),
    )
    .all();

  for (const row of rows) {
    deleteContentRowAndUsages(tx, schema, row.contentUuid);
  }
}

async function validateContentAssets(data: ContentOutputData) {
  const assetUuids = Array.from(
    new Set(extractContentAssetRefs(data).map((ref) => ref.assetUuid)),
  );
  const assets = [];

  for (const assetUuid of assetUuids) {
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (!asset) {
      throw new ContentValidationError('Content asset does not exist');
    }
    assets.push(asset);
  }

  const assetByUuid = new Map(assets.map((asset) => [asset.assetUuid, asset]));

  for (const block of data.blocks) {
    if (!isContentAssetBlockType(block.type)) continue;
    const refs = extractContentAssetRefs({ blocks: [block] });
    for (const ref of refs) {
      const asset = assetByUuid.get(ref.assetUuid);
      if (!asset) continue;
      if (
        (block.type === 'contentMedia' || block.type === 'contentGallery') &&
        asset.type !== AssetType.Image &&
        asset.type !== AssetType.Video
      ) {
        throw new ContentValidationError(
          'Content media and gallery blocks can only use images or videos',
        );
      }
    }
  }

  return assets;
}

async function hydrateContentData(
  data: ContentOutputData,
): Promise<ContentOutputData> {
  const normalized = normalizeContentData(data);
  const assetCache = new Map<string, any>();
  const externalLinkCache = new Map<
    string,
    Awaited<ReturnType<typeof findExternalLink>>
  >();

  async function hydrateAsset(assetUuid: string) {
    if (assetCache.has(assetUuid)) return assetCache.get(assetUuid);
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (!asset) return undefined;
    const urls = await buildAdminAssetUrls(asset);
    const hydrated = {
      assetUuid: asset.assetUuid,
      name: assetSourceName(asset.meta),
      type: asset.type,
      extension: asset.extension,
      size: asset.size,
      media: urls.media,
      assetUrl: urls.assetUrl,
      archivedOriginal:
        asset.type === AssetType.Other
          ? archivedOriginalFromMeta(asset.meta)
          : undefined,
    };
    assetCache.set(assetUuid, hydrated);
    return hydrated;
  }

  const blocks: ContentOutputBlock[] = [];
  for (const block of normalized.blocks) {
    const data = { ...block.data };
    if (block.type === 'contentMedia' || block.type === 'contentAttachment') {
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
      let link = url ? externalLinkCache.get(url) : undefined;
      if (url && !externalLinkCache.has(url)) {
        link = await findExternalLink(url);
        externalLinkCache.set(url, link);
      }
      data.url = url;
      if (link) Object.assign(data, link);
    }
    blocks.push({ ...block, data });
  }

  return { ...normalized, blocks };
}

function buildPreparedAssetUsages(
  contentUuid: string,
  data: ContentOutputData,
): PreparedContentAssetUsage[] {
  const refsByAssetUuid = new Map<string, ContentAssetUsageMeta['refs']>();
  for (const ref of extractContentAssetRefs(data)) {
    const refs = refsByAssetUuid.get(ref.assetUuid) ?? [];
    refs.push({
      blockId: ref.blockId,
      blockType: ref.blockType,
      isPrivate: ref.isPrivate,
    });
    refsByAssetUuid.set(ref.assetUuid, refs);
  }

  return Array.from(refsByAssetUuid.entries()).map(([assetUuid, refs]) => ({
    assetUuid,
    contentUuid,
    meta: {
      role: 'content',
      refs,
      isPrivate: refs.some((ref) => ref.isPrivate),
    },
  }));
}

function deleteContentRowAndUsages(tx: any, schema: any, contentUuid: string) {
  tx.delete(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.containerType, 'content'),
        eq(schema.assetUsages.containerId, contentUuid),
      ),
    )
    .run();
  tx.delete(schema.content)
    .where(eq(schema.content.contentUuid, contentUuid))
    .run();
}
