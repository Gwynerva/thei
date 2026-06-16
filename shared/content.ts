import { AssetType, type ArchivedOriginalFileMeta } from './asset';

export const CONTENT_OWNER_TYPES = ['project', 'news'] as const;
export type ContentOwnerType = (typeof CONTENT_OWNER_TYPES)[number];

export const CONTENT_SLOTS = ['project-description', 'news-body'] as const;
export type ContentSlot = (typeof CONTENT_SLOTS)[number];

export const CONTENT_BLOCK_TYPES = [
  'paragraph',
  'header',
  'list',
  'quote',
  'contentImage',
  'contentGallery',
  'contentAttachment',
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export interface ContentPrivateAccessTune {
  isPrivate: boolean;
}

export interface ContentOutputBlock<
  TType extends ContentBlockType = ContentBlockType,
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  id?: string;
  type: TType;
  data: TData;
  tunes?: {
    privateAccess?: ContentPrivateAccessTune;
  };
}

export interface ContentOutputData {
  version?: string;
  time?: number;
  blocks: ContentOutputBlock[];
}

export interface ContentSummary {
  blockCount: number;
  assetCount: number;
  assetTotalSize: number;
}

export interface ContentEditValue {
  contentUuid?: string;
  data: ContentOutputData | null;
}

export type ContentFieldModelValue = ContentEditValue & Partial<ContentSummary>;
export type ContentFieldValue = ContentEditValue & ContentSummary;

export interface ContentAssetData {
  assetUuid: string;
  type?: AssetType;
  extension?: string;
  size?: number;
  previewUrl?: string;
  videoUrl?: string;
  assetUrl?: string;
  archivedOriginal?: ArchivedOriginalFileMeta;
}

export interface ContentAssetRef {
  assetUuid: string;
  blockId?: string;
  blockType: ContentBlockType;
  isPrivate: boolean;
}

export class ContentValidationError extends Error {}

export function createEmptyContentData(): ContentOutputData {
  return { blocks: [] };
}

export function normalizeContentData(value: unknown): ContentOutputData {
  if (!value) return createEmptyContentData();
  if (!isRecord(value)) {
    throw new ContentValidationError('Invalid content data');
  }

  const rawBlocks = value.blocks;
  if (!Array.isArray(rawBlocks)) {
    throw new ContentValidationError('Invalid content blocks');
  }

  const blocks = rawBlocks
    .map(normalizeContentBlock)
    .filter((block) => !isContentBlockEmpty(block));

  return {
    version: optionalString(value.version),
    time: optionalNumber(value.time),
    blocks,
  };
}

export function isContentEmpty(data: ContentOutputData | null | undefined) {
  return !data || normalizeContentData(data).blocks.length === 0;
}

export function summarizeContentData(
  data: ContentOutputData | null | undefined,
  assetSizes: Map<string, number> = new Map(),
): ContentSummary {
  const normalized = normalizeContentData(data);
  const assetUuids = new Set<string>();
  for (const ref of extractContentAssetRefs(normalized)) {
    assetUuids.add(ref.assetUuid);
  }

  let assetTotalSize = 0;
  for (const assetUuid of assetUuids) {
    assetTotalSize += assetSizes.get(assetUuid) ?? 0;
  }

  return {
    blockCount: normalized.blocks.length,
    assetCount: assetUuids.size,
    assetTotalSize,
  };
}

export function collectContentAssetSizeMap(
  data: ContentOutputData | null | undefined,
): Map<string, number> {
  const sizes = new Map<string, number>();
  const normalized = normalizeContentData(data);

  for (const block of normalized.blocks) {
    if (block.type === 'contentImage' || block.type === 'contentAttachment') {
      addAssetSize(sizes, (block.data as any).asset);
      continue;
    }

    if (block.type === 'contentGallery') {
      const assets = Array.isArray((block.data as any).assets)
        ? (block.data as any).assets
        : [];
      for (const asset of assets) addAssetSize(sizes, asset);
    }
  }

  return sizes;
}

export function extractContentAssetRefs(
  data: ContentOutputData,
): ContentAssetRef[] {
  const refs: ContentAssetRef[] = [];
  for (const block of data.blocks) {
    const isPrivate = contentBlockIsPrivate(block);
    const blockId = block.id;

    if (block.type === 'contentImage' || block.type === 'contentAttachment') {
      const asset = normalizeContentAsset((block.data as any).asset);
      if (asset) {
        refs.push({
          assetUuid: asset.assetUuid,
          blockId,
          blockType: block.type,
          isPrivate,
        });
      }
      continue;
    }

    if (block.type === 'contentGallery') {
      const assets = Array.isArray((block.data as any).assets)
        ? (block.data as any).assets
        : [];
      for (const item of assets) {
        const asset = normalizeContentAsset(item);
        if (!asset) continue;
        refs.push({
          assetUuid: asset.assetUuid,
          blockId,
          blockType: block.type,
          isPrivate,
        });
      }
    }
  }
  return refs;
}

function addAssetSize(sizes: Map<string, number>, value: unknown) {
  const asset = normalizeContentAsset(value);
  if (!asset || typeof asset.size !== 'number') return;
  sizes.set(asset.assetUuid, asset.size);
}

export function contentBlockIsPrivate(block: ContentOutputBlock): boolean {
  return block.tunes?.privateAccess?.isPrivate === true;
}

export function isContentAssetBlockType(type: ContentBlockType): boolean {
  return (
    type === 'contentImage' ||
    type === 'contentGallery' ||
    type === 'contentAttachment'
  );
}

function normalizeContentBlock(value: unknown): ContentOutputBlock {
  if (!isRecord(value)) {
    throw new ContentValidationError('Invalid content block');
  }

  const type = value.type;
  if (!isContentBlockType(type)) {
    throw new ContentValidationError('Unsupported content block');
  }

  const data = normalizeBlockData(type, value.data);
  const tune = normalizePrivateAccessTune(value.tunes);

  return {
    id: optionalString(value.id),
    type,
    data,
    ...(tune ? { tunes: { privateAccess: tune } } : {}),
  };
}

function normalizeBlockData(
  type: ContentBlockType,
  value: unknown,
): Record<string, unknown> {
  const data = isRecord(value) ? value : {};

  switch (type) {
    case 'paragraph':
      return { text: stringValue(data.text) };

    case 'header':
      return {
        text: stringValue(data.text),
        level: normalizeHeaderLevel(data.level),
      };

    case 'quote':
      return {
        text: stringValue(data.text),
        caption: stringValue(data.caption),
        alignment: data.alignment === 'center' ? 'center' : 'left',
      };

    case 'list':
      return {
        style: normalizeListStyle(data.style),
        meta: normalizePlainRecord(data.meta),
        items: normalizeListItems(data.items),
      };

    case 'contentImage':
      return {
        asset: normalizeContentAsset(data.asset),
        caption: optionalTrimmedString(data.caption),
      };

    case 'contentGallery':
      return {
        assets: Array.isArray(data.assets)
          ? data.assets.map(normalizeContentAsset).filter(Boolean)
          : [],
        caption: optionalTrimmedString(data.caption),
      };

    case 'contentAttachment':
      return {
        asset: normalizeContentAsset(data.asset),
        title: optionalTrimmedString(data.title),
        caption: optionalTrimmedString(data.caption),
      };
  }
}

function isContentBlockEmpty(block: ContentOutputBlock): boolean {
  switch (block.type) {
    case 'paragraph':
    case 'header':
      return !plainText((block.data as any).text);

    case 'quote':
      return (
        !plainText((block.data as any).text) &&
        !plainText((block.data as any).caption)
      );

    case 'list':
      return !listItemsHaveContent((block.data as any).items);

    case 'contentImage':
    case 'contentAttachment':
      return !normalizeContentAsset((block.data as any).asset);

    case 'contentGallery':
      return !(
        Array.isArray((block.data as any).assets) &&
        (block.data as any).assets.some((item: unknown) =>
          normalizeContentAsset(item),
        )
      );
  }
}

function normalizePrivateAccessTune(
  value: unknown,
): ContentPrivateAccessTune | undefined {
  if (!isRecord(value)) return undefined;
  const privateAccess = value.privateAccess;
  if (!isRecord(privateAccess)) return undefined;
  return privateAccess.isPrivate === true ? { isPrivate: true } : undefined;
}

function normalizeContentAsset(value: unknown): ContentAssetData | null {
  if (!isRecord(value)) return null;
  const assetUuid = optionalString(value.assetUuid);
  if (!assetUuid) return null;
  const archivedOriginal = normalizeArchivedOriginal(value.archivedOriginal);

  return {
    assetUuid,
    type: isAssetType(value.type) ? value.type : undefined,
    extension: optionalString(value.extension),
    size: optionalNumber(value.size),
    previewUrl: optionalString(value.previewUrl),
    videoUrl: optionalString(value.videoUrl),
    assetUrl: optionalString(value.assetUrl),
    ...(archivedOriginal ? { archivedOriginal } : {}),
  };
}

function normalizeArchivedOriginal(
  value: unknown,
): ArchivedOriginalFileMeta | undefined {
  if (!isRecord(value)) return undefined;
  const extension = optionalString(value.extension);
  const size = optionalNumber(value.size);
  if (!extension || size === undefined) return undefined;

  return {
    extension,
    size,
    name: optionalString(value.name),
  };
}

function normalizeHeaderLevel(value: unknown): number {
  return typeof value === 'number' && [2, 3, 4].includes(value) ? value : 2;
}

function normalizeListStyle(value: unknown): string {
  return value === 'ordered' || value === 'checklist' ? value : 'unordered';
}

function normalizeListItems(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const source = isRecord(item) ? item : {};
    return {
      content: stringValue(source.content),
      meta: normalizePlainRecord(source.meta),
      items: normalizeListItems(source.items),
    };
  });
}

function normalizePlainRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizePlainValue(item);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }

  return result;
}

function normalizePlainValue(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.map(normalizePlainValue).filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    return normalizePlainRecord(value);
  }
  return undefined;
}

function listItemsHaveContent(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((item) => {
    if (!isRecord(item)) return false;
    return plainText(item.content) || listItemsHaveContent(item.items);
  });
}

function plainText(value: unknown): string {
  return stringValue(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function optionalTrimmedString(value: unknown): string | undefined {
  const text = optionalString(value)?.trim();
  return text || undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isContentBlockType(value: unknown): value is ContentBlockType {
  return (
    typeof value === 'string' &&
    (CONTENT_BLOCK_TYPES as readonly string[]).includes(value)
  );
}

function isAssetType(value: unknown): value is AssetType {
  return (
    value === AssetType.Image ||
    value === AssetType.Video ||
    value === AssetType.Audio ||
    value === AssetType.Other
  );
}
