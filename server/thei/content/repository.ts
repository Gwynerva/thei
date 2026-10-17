import { and, eq } from 'drizzle-orm';
import { EntityPrefix, generateUniqueId } from '../entity-id';
import {
  canonicalizeContentData,
  collectContentExternalLinkUrls,
  contentAssetMedia,
  contentPreviewAssets,
  createEmptyContentData,
  ContentValidationError,
  CONTENT_FILE_BLOCKS,
  extractContentAssetRefs,
  hydrateContentBlockFiles,
  isContentFileBlockType,
  normalizeContentData,
  summarizeContentData,
  type ContentEditValue,
  type ContentFieldValue,
  type ContentFileBlock,
  type ContentOutputBlock,
  type ContentOutputData,
  type ContentOwnerType,
  type ContentSlot,
} from '#layers/thei/shared/content';
import {
  AssetType,
  type ContentAssetUsageMeta,
} from '#layers/thei/shared/asset';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { audioDescriptorFromMeta } from '#layers/thei/shared/audio';
import { buildAdminAssetUrls } from '../assets/urls';
import { archivedOriginalFromMeta } from '#layers/thei/shared/asset';
import {
  createExternalLinkLoader,
  ensureExternalLinks,
  scheduleExternalLinkSweep,
} from '../external-links/repository';
import { assetSelectionError } from '#layers/thei/shared/asset-library';
import { optionalContentDraftRef } from '#layers/thei/shared/content-history';
import {
  recordContentDeletion,
  recordContentSave,
  touchReleasedAssets,
} from './history';
import { deleteUsagesReleasing } from '../assets/repository/usages/release';
import {
  forgetContentAnchors,
  recordContentAnchors,
} from '../content-links/anchor-ledger';

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

/**
 * A text's preview picture as the admin sees it, for a row of a list: only
 * the files the picture is chosen from are looked up, in order, rather than
 * the whole text hydrated with every file and link it holds.
 */
export async function buildContentPreviewMedia(
  ownerType: ContentOwnerType,
  ownerId: string,
  slot: ContentSlot,
): Promise<MediaDescriptor | undefined> {
  const row = await findContentByOwner(ownerType, ownerId, slot);
  if (!row) return undefined;
  for (const ref of contentPreviewAssets(normalizeContentData(row.data))) {
    const assetUuid = (ref as { assetUuid?: unknown } | null)?.assetUuid;
    if (typeof assetUuid !== 'string' || !assetUuid) continue;
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (!asset) continue;
    const media = contentAssetMedia({
      media: (await buildAdminAssetUrls(asset)).media,
    });
    if (media) return media;
  }
  return undefined;
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
      draftRef?: string;
    }
  | {
      type: 'save';
      contentUuid: string;
      draftRef?: string;
      /** Whether the blocks differ from the ones already stored. */
      changed: boolean;
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
  const draft = optionalContentDraftRef(value?.draftRef);

  if (data.blocks.length === 0) {
    return {
      type: 'delete',
      existingContentUuid: existing?.contentUuid,
      ...draft,
    };
  }

  const assetRows = await validateContentAssets(data);
  await ensureExternalLinks(collectContentExternalLinkUrls(data));
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
    changed: JSON.stringify(data) !== JSON.stringify(existing?.data),
    data,
    ...summary,
    assetUsages: buildPreparedAssetUsages(contentUuid, data),
    ...draft,
  };
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
  // A link the text no longer holds is forgotten once saving settles.
  scheduleExternalLinkSweep();
  const now = Date.now();
  // Read inside the transaction: this is the text the save replaces.
  const previous = tx
    .select({
      contentUuid: schema.content.contentUuid,
      data: schema.content.data,
      updatedAt: schema.content.updatedAt,
    })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, ownerType),
        eq(schema.content.ownerId, ownerId),
        eq(schema.content.slot, slot),
      ),
    )
    .get();
  const previousAssets: string[] = previous
    ? tx
        .select({ assetUuid: schema.assetUsages.assetUuid })
        .from(schema.assetUsages)
        .where(
          and(
            eq(schema.assetUsages.containerType, 'content'),
            eq(schema.assetUsages.containerId, previous.contentUuid),
          ),
        )
        .all()
        .map((row: { assetUuid: string }) => row.assetUuid)
    : [];
  // The anchors its headings had and have, for a link to one renamed since;
  // a form resends texts it did not change, which have nothing new to tell.
  if (prepared.type === 'delete' || prepared.changed || !previous)
    recordContentAnchors(
      tx,
      schema,
      { ownerType, ownerId, slot },
      [previous?.data, prepared.type === 'delete' ? undefined : prepared.data],
      now,
    );
  const recordHistory = (saved: ContentOutputData) =>
    recordContentSave(
      tx,
      schema,
      {
        ownerType,
        ownerId,
        slot,
        previous,
        saved,
        draftRef: prepared.draftRef,
      },
      now,
    );

  if (prepared.type === 'delete') {
    recordHistory(createEmptyContentData());
    if (!prepared.existingContentUuid) return;
    deleteContentRowAndUsages(tx, schema, prepared.existingContentUuid);
    touchReleasedAssets(tx, schema, previousAssets, now);
    return;
  }

  recordHistory(prepared.data);
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
        // Saving a form resends every content field it holds; only the ones
        // whose blocks actually changed were edited now.
        ...(prepared.changed ? { updatedAt: now } : {}),
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
  // A file this text no longer shows gets its day of grace from now, not
  // from whenever the text was last saved with it.
  touchReleasedAssets(
    tx,
    schema,
    previousAssets.filter(
      (assetUuid) =>
        !prepared.assetUsages.some((usage) => usage.assetUuid === assetUuid),
    ),
    now,
  );
}

export function deleteContentForOwner(
  tx: any,
  schema: any,
  ownerType: ContentOwnerType,
  ownerId: string,
) {
  const rows = tx
    .select({
      contentUuid: schema.content.contentUuid,
      slot: schema.content.slot,
      data: schema.content.data,
      updatedAt: schema.content.updatedAt,
    })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, ownerType),
        eq(schema.content.ownerId, ownerId),
      ),
    )
    .all();

  // What the owner held, saved or still a draft, stays in the history.
  recordContentDeletion(tx, schema, ownerType, ownerId, rows);
  forgetContentAnchors(tx, schema, ownerType, ownerId);
  for (const row of rows) {
    deleteContentRowAndUsages(tx, schema, row.contentUuid);
  }
  if (rows.length) scheduleExternalLinkSweep();
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
    if (!isContentFileBlockType(block.type)) continue;
    const { accepts, sizeLimitPolicy }: ContentFileBlock =
      CONTENT_FILE_BLOCKS[block.type];
    for (const ref of extractContentAssetRefs({ blocks: [block] })) {
      const asset = assetByUuid.get(ref.assetUuid);
      if (!asset) continue;
      if (accepts !== 'any' && !accepts.includes(asset.type))
        throw new ContentValidationError(
          `A ${block.type} block cannot show a file of this kind`,
        );
      if (assetSelectionError(asset, { sizeLimitPolicy }) === 'size')
        throw new ContentValidationError(
          'Content asset exceeds the maximum allowed size',
        );
    }
  }

  return assets;
}

export async function hydrateContentData(
  data: ContentOutputData,
): Promise<ContentOutputData> {
  const normalized = normalizeContentData(data);
  const assetCache = new Map<string, any>();
  const loadExternalLink = createExternalLinkLoader();

  async function hydrateAsset(assetUuid: string) {
    if (assetCache.has(assetUuid)) return assetCache.get(assetUuid);
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (!asset) return undefined;
    const urls = await buildAdminAssetUrls(asset);
    const hydrated = {
      assetUuid: asset.assetUuid,
      type: asset.type,
      extension: asset.extension,
      size: asset.size,
      media: urls.media,
      audio:
        asset.type === AssetType.Audio
          ? audioDescriptorFromMeta(asset.meta)
          : undefined,
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
    if (isContentFileBlockType(block.type)) {
      Object.assign(data, await hydrateContentBlockFiles(block, hydrateAsset));
    } else if (block.type === 'externalLink') {
      const url = (block.data as any).url;
      const link = url ? await loadExternalLink(url) : undefined;
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
  deleteUsagesReleasing(
    tx,
    schema,
    and(
      eq(schema.assetUsages.containerType, 'content'),
      eq(schema.assetUsages.containerId, contentUuid),
    ),
  );
  tx.delete(schema.content)
    .where(eq(schema.content.contentUuid, contentUuid))
    .run();
}
