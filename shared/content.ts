import { AssetType, type ArchivedOriginalFileMeta } from './asset';
import type { MediaDescriptor } from './media';

export const CONTENT_OWNER_TYPES = [
  'project',
  'project-section',
  'event',
  'news',
] as const;
export type ContentOwnerType = (typeof CONTENT_OWNER_TYPES)[number];

export const CONTENT_SLOTS = [
  'project-description',
  'project-section-body',
  'event-body',
  'news-body',
] as const;
export type ContentSlot = (typeof CONTENT_SLOTS)[number];

export const CONTENT_BLOCK_TYPES = [
  'paragraph',
  'header',
  'list',
  'quote',
  'contentMedia',
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
  name?: string;
  type?: AssetType;
  extension?: string;
  size?: number;
  media?: MediaDescriptor;
  assetUrl?: string;
  archivedOriginal?: ArchivedOriginalFileMeta;
}

export interface ContentAssetRef {
  assetUuid: string;
  blockId?: string;
  blockType: ContentBlockType;
  isPrivate: boolean;
}

export interface ContentGalleryItem {
  id: string;
  asset: ContentAssetData;
  caption?: string;
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

/**
 * Editor.js refreshes service metadata such as `time`, `version`, and block
 * ids while serializing. Those fields are not user content and must not make
 * an unchanged editor dirty.
 */
export function contentDataIsSemanticallyEqual(
  left: ContentOutputData | null | undefined,
  right: ContentOutputData | null | undefined,
): boolean {
  return jsonValuesEqual(
    semanticContentBlocks(left),
    semanticContentBlocks(right),
  );
}

function semanticContentBlocks(
  data: ContentOutputData | null | undefined,
): Omit<ContentOutputBlock, 'id'>[] {
  return normalizeContentData(data).blocks.map(
    ({ id: _id, ...block }) => block,
  );
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
    if (block.type === 'contentMedia' || block.type === 'contentAttachment') {
      addAssetSize(sizes, (block.data as any).asset);
      continue;
    }

    if (block.type === 'contentGallery') {
      const items = Array.isArray((block.data as any).items)
        ? (block.data as any).items
        : [];
      for (const item of items) addAssetSize(sizes, item?.asset);
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

    if (block.type === 'contentMedia' || block.type === 'contentAttachment') {
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
      const items = Array.isArray((block.data as any).items)
        ? (block.data as any).items
        : [];
      for (const item of items) {
        const asset = normalizeContentAsset(item?.asset);
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
    type === 'contentMedia' ||
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

    case 'contentMedia':
      return {
        asset: normalizeContentAsset(data.asset),
        caption: optionalTrimmedString(data.caption),
      };

    case 'contentGallery':
      return {
        items: Array.isArray(data.items)
          ? data.items.map(normalizeGalleryItem).filter(Boolean)
          : [],
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

    case 'contentMedia':
    case 'contentAttachment':
      return !normalizeContentAsset((block.data as any).asset);

    case 'contentGallery':
      return !(
        Array.isArray((block.data as any).items) &&
        (block.data as any).items.some((item: any) =>
          normalizeContentAsset(item?.asset),
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
    name: optionalString(value.name),
    type: isAssetType(value.type) ? value.type : undefined,
    extension: optionalString(value.extension),
    size: optionalNumber(value.size),
    media: normalizeMediaDescriptor(value.media),
    assetUrl: optionalString(value.assetUrl),
    ...(archivedOriginal ? { archivedOriginal } : {}),
  };
}

function normalizeMediaDescriptor(value: unknown): MediaDescriptor | undefined {
  if (!isRecord(value)) return undefined;
  const src = optionalString(value.src);
  const previewSrc = optionalString(value.previewSrc);
  const kind = value.kind;
  if (!src || !previewSrc || (kind !== 'image' && kind !== 'video')) {
    return undefined;
  }
  return {
    src,
    previewSrc,
    kind,
    accentHue: optionalNumber(value.accentHue),
    width: optionalNumber(value.width),
    height: optionalNumber(value.height),
  };
}

function normalizeGalleryItem(value: unknown): ContentGalleryItem | null {
  if (!isRecord(value)) return null;
  const id = optionalTrimmedString(value.id);
  const asset = normalizeContentAsset(value.asset);
  if (!id || !asset) return null;
  return {
    id,
    asset,
    caption: optionalTrimmedString(value.caption),
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

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }

  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter(
    (key) => right[key] !== undefined,
  );
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      jsonValuesEqual(left[key], right[key]),
  );
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
