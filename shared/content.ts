import { AssetType, type ArchivedOriginalFileMeta } from './asset';
import type { MediaDescriptor } from './media';
import { normalizeExternalLinkUrl, type ExternalLink } from './external-link';
import {
  contentInlineLinksFromData,
  normalizeContentInlineHtml,
  normalizeContentText,
} from './content-link';

export const CONTENT_OWNER_TYPES = [
  'project',
  'project-stage',
  'project-section',
  'event',
  'page',
  'news',
] as const;
export type ContentOwnerType = (typeof CONTENT_OWNER_TYPES)[number];

export const CONTENT_SLOTS = [
  'project-description',
  'project-stage-body',
  'project-section-body',
  'event-body',
  'page-body',
  'news-body',
] as const;
export type ContentSlot = (typeof CONTENT_SLOTS)[number];

export const CONTENT_BLOCK_TYPES = [
  'paragraph',
  'header',
  'list',
  'quote',
  'delimiter',
  'contentMedia',
  'contentGallery',
  'contentAttachment',
  'externalLink',
  'entityLink',
  'privateSectionBoundary',
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export interface ContentPrivateAccessTune {
  isPrivate: boolean;
}

export type ContentPrivateSectionEdge = 'start' | 'end';

export interface ContentPrivateSectionBoundaryData {
  sectionId: string;
  edge: ContentPrivateSectionEdge;
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

export interface ContentPrivateSectionRange {
  sectionId: string;
  startIndex: number;
  endIndex: number;
}

export interface PublicPrivateSectionPlaceholderBlock {
  type: 'privateSectionPlaceholder';
  data: ContentSummary;
}

export interface PublicPrivateSectionExpandedBlock {
  type: 'privateSectionExpanded';
  data: {
    summary: ContentSummary;
    blocks: ContentOutputBlock[];
  };
}

export type PublicContentOutputBlock =
  | ContentOutputBlock
  | PublicPrivateSectionPlaceholderBlock
  | PublicPrivateSectionExpandedBlock;

export interface PublicContentOutputData {
  version?: string;
  blocks: PublicContentOutputBlock[];
}

export interface ContentSummary {
  blockCount: number;
  wordCount: number;
  assetCount: number;
  assetTotalSize: number;
}

export interface ContentEditValue {
  contentUuid?: string;
  data: ContentOutputData | null;
  updatedAt?: number;
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

export const CONTENT_MEDIA_LAYOUTS = [
  'centered',
  'natural',
  'stretch',
] as const;
export type ContentMediaLayout = (typeof CONTENT_MEDIA_LAYOUTS)[number];

export interface ContentPreview {
  text: string;
  media?: MediaDescriptor;
}

export interface ContentAnalysis {
  data: ContentOutputData;
  preview: ContentPreview;
  summary: ContentSummary;
}

export type ContentExternalLinkData = Pick<ExternalLink, 'url'> &
  Partial<Omit<ExternalLink, 'url'>>;

export class ContentValidationError extends Error {}

export function createEmptyContentData(): ContentOutputData {
  return { blocks: [] };
}

export function createEmptyContentFieldValue(): ContentFieldValue {
  return {
    data: createEmptyContentData(),
    blockCount: 0,
    wordCount: 0,
    assetCount: 0,
    assetTotalSize: 0,
  };
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
    blocks: normalizePrivateSections(blocks),
  };
}

export function contentPrivateSectionRanges(
  value: ContentOutputData | null | undefined,
): ContentPrivateSectionRange[] {
  const blocks = normalizeContentData(value).blocks;
  const boundaries = new Map<string, number[]>();

  blocks.forEach((block, index) => {
    if (block.type !== 'privateSectionBoundary') return;
    const sectionId = (
      block.data as unknown as ContentPrivateSectionBoundaryData
    ).sectionId;
    const indices = boundaries.get(sectionId) ?? [];
    indices.push(index);
    boundaries.set(sectionId, indices);
  });

  return Array.from(boundaries, ([sectionId, indices]) => ({
    sectionId,
    startIndex: indices[0]!,
    endIndex: indices[1]!,
  })).sort((left, right) => left.startIndex - right.startIndex);
}

export function contentBlockIsInPrivateSection(
  ranges: readonly ContentPrivateSectionRange[],
  index: number,
): boolean {
  return ranges.some(
    (range) => range.startIndex < index && index < range.endIndex,
  );
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
  return contentSemanticKey(left) === contentSemanticKey(right);
}

/**
 * Returns the exact content shape that can be persisted. Hydrated asset and
 * external-link presentation data are deliberately excluded.
 */
export function canonicalizeContentData(
  value: ContentOutputData | null | undefined,
): ContentOutputData {
  const normalized = normalizeContentData(value);
  return {
    ...normalized,
    blocks: normalized.blocks.map((block) => {
      if (block.type === 'contentMedia') {
        return {
          ...block,
          data: {
            asset: contentAssetIdentity((block.data as any).asset),
            layout: (block.data as any).layout,
            caption: (block.data as any).caption,
          },
        };
      }
      if (block.type === 'contentGallery') {
        const items = Array.isArray((block.data as any).items)
          ? (block.data as any).items
          : [];
        return {
          ...block,
          data: {
            items: items.map((item: ContentGalleryItem) => ({
              id: item.id,
              asset: contentAssetIdentity(item.asset),
              caption: item.caption,
            })),
          },
        };
      }
      if (block.type === 'contentAttachment') {
        return {
          ...block,
          data: {
            asset: contentAssetIdentity((block.data as any).asset),
            title: (block.data as any).title,
            caption: (block.data as any).caption,
          },
        };
      }
      return block;
    }),
  };
}

/** A stable key for dirty-state and snapshot deduplication. */
export function contentSemanticKey(
  data: ContentOutputData | null | undefined,
): string {
  return JSON.stringify(
    canonicalizeContentData(data).blocks.map(({ id: _id, ...block }) => block),
  );
}

export function collectContentExternalLinkUrls(
  data: ContentOutputData | null | undefined,
): string[] {
  const normalized = normalizeContentData(data);
  const urls = new Set<string>();
  for (const block of normalized.blocks) {
    if (block.type === 'privateSectionBoundary') continue;
    if (block.type === 'externalLink') urls.add((block.data as any).url);
  }
  for (const link of contentInlineLinksFromData(normalized)) {
    if (link.kind === 'external') urls.add(link.url);
  }
  return [...urls];
}

export function isContentEmpty(data: ContentOutputData | null | undefined) {
  return !data || normalizeContentData(data).blocks.length === 0;
}

export function buildContentPreview(
  data: ContentOutputData | null | undefined,
  textLimit = 200,
): ContentPreview {
  const normalized = normalizeContentData(data);
  return buildNormalizedContentPreview(normalized, textLimit);
}

export function analyzeContentData(
  data: ContentOutputData | null | undefined,
  textLimit = 200,
): ContentAnalysis {
  const normalized = normalizeContentData(data);
  const assetSizes = collectNormalizedContentAssetSizeMap(normalized);
  return {
    data: normalized,
    preview: buildNormalizedContentPreview(normalized, textLimit),
    summary: summarizeNormalizedContentData(normalized, assetSizes),
  };
}

function buildNormalizedContentPreview(
  normalized: ContentOutputData,
  textLimit: number,
): ContentPreview {
  let media: MediaDescriptor | undefined;

  for (const block of normalized.blocks) {
    if (!media && block.type === 'contentMedia') {
      media = contentAssetMedia((block.data as any).asset);
    } else if (!media && block.type === 'contentGallery') {
      const items = Array.isArray((block.data as any).items)
        ? (block.data as any).items
        : [];
      media = items
        .map((item: any) => contentAssetMedia(item?.asset))
        .find(Boolean);
    }
  }

  return {
    text: truncatePreviewText(
      contentPreviewTextFromNormalized(normalized),
      textLimit,
    ),
    ...(media ? { media } : {}),
  };
}

export function contentPlainText(
  data: ContentOutputData | null | undefined,
): string {
  return contentPlainTextFromNormalized(normalizeContentData(data));
}

function contentPlainTextFromNormalized(
  normalized: ContentOutputData,
  includeExternalLinks = true,
) {
  const textParts: string[] = [];
  for (const block of normalized.blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'header':
        appendPreviewText(textParts, (block.data as any).text);
        break;
      case 'quote':
        appendPreviewText(textParts, (block.data as any).text);
        appendPreviewText(textParts, (block.data as any).caption);
        break;
      case 'list':
        collectListPreviewText(textParts, (block.data as any).items);
        break;
      case 'delimiter':
        break;
      case 'contentMedia':
        appendPreviewText(textParts, (block.data as any).caption);
        break;
      case 'contentGallery':
        collectGalleryPreviewText(textParts, (block.data as any).items);
        break;
      case 'contentAttachment':
        appendPreviewText(textParts, (block.data as any).title);
        appendPreviewText(textParts, (block.data as any).caption);
        break;
      case 'externalLink':
        if (includeExternalLinks) {
          appendPreviewText(textParts, (block.data as any).url);
        }
        break;
      case 'entityLink':
      case 'privateSectionBoundary':
        break;
    }
  }
  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}

function contentPreviewTextFromNormalized(normalized: ContentOutputData) {
  const textParts: string[] = [];
  for (const block of normalized.blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'header':
      case 'quote':
        appendPreviewText(textParts, (block.data as any).text);
        break;
      case 'list':
        collectListPreviewText(textParts, (block.data as any).items);
        break;
      case 'delimiter':
      case 'privateSectionBoundary':
        break;
    }
  }
  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}

export function summarizeContentData(
  data: ContentOutputData | null | undefined,
  assetSizes: Map<string, number> = new Map(),
): ContentSummary {
  const normalized = normalizeContentData(data);
  return summarizeNormalizedContentData(normalized, assetSizes);
}

function summarizeNormalizedContentData(
  normalized: ContentOutputData,
  assetSizes: Map<string, number>,
): ContentSummary {
  const assetUuids = new Set<string>();
  for (const ref of extractContentAssetRefs(normalized)) {
    assetUuids.add(ref.assetUuid);
  }

  let assetTotalSize = 0;
  for (const assetUuid of assetUuids) {
    assetTotalSize += assetSizes.get(assetUuid) ?? 0;
  }

  return {
    blockCount: normalized.blocks.filter(
      (block) => block.type !== 'privateSectionBoundary',
    ).length,
    wordCount: countContentWords(normalized),
    assetCount: assetUuids.size,
    assetTotalSize,
  };
}

function countContentWords(normalized: ContentOutputData): number {
  const text = contentPlainTextFromNormalized(normalized, false);
  return text.match(/[\p{L}\p{N}]+(?:[\p{Pd}'’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function collectContentAssetSizeMap(
  data: ContentOutputData | null | undefined,
): Map<string, number> {
  const normalized = normalizeContentData(data);
  return collectNormalizedContentAssetSizeMap(normalized);
}

function collectNormalizedContentAssetSizeMap(
  normalized: ContentOutputData,
): Map<string, number> {
  const sizes = new Map<string, number>();

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
  const normalized = normalizeContentData(data);
  const ranges = contentPrivateSectionRanges(normalized);
  const refs: ContentAssetRef[] = [];
  for (const [index, block] of normalized.blocks.entries()) {
    const isPrivate =
      contentBlockIsPrivate(block) ||
      contentBlockIsInPrivateSection(ranges, index);
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

export function collectContentAssetUuids(
  data: ContentOutputData | null | undefined,
): string[] {
  return Array.from(
    new Set(
      extractContentAssetRefs(normalizeContentData(data)).map(
        (ref) => ref.assetUuid,
      ),
    ),
  );
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
  const tune =
    type === 'privateSectionBoundary'
      ? undefined
      : normalizePrivateAccessTune(value.tunes);

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
      return { text: normalizeContentInlineHtml(data.text) };

    case 'header':
      return {
        text: normalizeHeaderText(data.text),
        level: normalizeHeaderLevel(data.level),
      };

    case 'quote':
      return {
        text: normalizeContentInlineHtml(data.text),
        caption: normalizeContentInlineHtml(data.caption),
        alignment: data.alignment === 'center' ? 'center' : 'left',
      };

    case 'list':
      return {
        style: normalizeListStyle(data.style),
        meta: normalizePlainRecord(data.meta),
        items: normalizeListItems(data.items),
      };

    case 'delimiter':
      return {};

    case 'contentMedia':
      return {
        asset: normalizeContentAsset(data.asset),
        layout: normalizeContentMediaLayout(data.layout),
        caption: optionalContentMediaCaption(data.caption),
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
        title: optionalNormalizedText(data.title),
        caption: optionalNormalizedText(data.caption),
      };

    case 'externalLink':
      return { url: normalizeExternalLinkUrl(data.url) };

    case 'entityLink': {
      const entityType =
        data.entityType === 'project' ||
        data.entityType === 'event' ||
        data.entityType === 'page'
          ? data.entityType
          : undefined;
      const entityId = optionalString(data.entityId)?.trim();
      return { entityType, entityId };
    }

    case 'privateSectionBoundary': {
      const sectionId = optionalString(data.sectionId)?.trim();
      if (!sectionId) {
        throw new ContentValidationError('Invalid private section boundary');
      }
      return {
        sectionId,
        edge: data.edge === 'end' ? 'end' : 'start',
      } satisfies ContentPrivateSectionBoundaryData;
    }
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

    case 'delimiter':
      return false;

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

    case 'externalLink':
      try {
        return !normalizeExternalLinkUrl((block.data as any).url);
      } catch {
        return true;
      }

    case 'entityLink':
      return !(
        ((block.data as any).entityType === 'project' ||
          (block.data as any).entityType === 'event' ||
          (block.data as any).entityType === 'page') &&
        optionalString((block.data as any).entityId)?.trim()
      );

    case 'privateSectionBoundary':
      return false;
  }
}

function normalizePrivateSections(
  blocks: ContentOutputBlock[],
): ContentOutputBlock[] {
  const boundaries = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    if (block.type !== 'privateSectionBoundary') return;
    const sectionId = (
      block.data as unknown as ContentPrivateSectionBoundaryData
    ).sectionId;
    const indices = boundaries.get(sectionId) ?? [];
    indices.push(index);
    boundaries.set(sectionId, indices);
  });

  const ranges = Array.from(boundaries, ([sectionId, indices]) => {
    if (indices.length !== 2) {
      throw new ContentValidationError('Invalid private section boundaries');
    }
    return {
      sectionId,
      startIndex: indices[0]!,
      endIndex: indices[1]!,
    };
  }).sort((left, right) => left.startIndex - right.startIndex);

  let previousEnd = -1;
  for (const range of ranges) {
    if (range.startIndex <= previousEnd) {
      throw new ContentValidationError('Private sections cannot overlap');
    }
    previousEnd = range.endIndex;
  }

  const emptyBoundaryIndices = new Set<number>();
  const innerIndices = new Set<number>();
  for (const range of ranges) {
    let hasContent = false;
    for (let index = range.startIndex + 1; index < range.endIndex; index++) {
      if (blocks[index]?.type !== 'privateSectionBoundary') hasContent = true;
      innerIndices.add(index);
    }
    if (!hasContent) {
      emptyBoundaryIndices.add(range.startIndex);
      emptyBoundaryIndices.add(range.endIndex);
    }
  }

  return blocks.flatMap((block, index): ContentOutputBlock[] => {
    if (emptyBoundaryIndices.has(index)) return [];
    if (block.type === 'privateSectionBoundary') {
      const data = block.data as unknown as ContentPrivateSectionBoundaryData;
      const range = ranges.find((item) => item.sectionId === data.sectionId)!;
      return [
        {
          ...block,
          data: {
            sectionId: data.sectionId,
            edge: index === range.startIndex ? 'start' : 'end',
          },
          tunes: undefined,
        },
      ];
    }
    if (!innerIndices.has(index) || !block.tunes?.privateAccess) return [block];
    const { tunes: _tunes, ...withoutTunes } = block;
    return [withoutTunes];
  });
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

function contentAssetIdentity(value: unknown) {
  const asset = normalizeContentAsset(value);
  return asset ? { assetUuid: asset.assetUuid } : null;
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
    caption: optionalContentMediaCaption(value.caption),
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
  return value === 3 ? 3 : 2;
}

function normalizeContentMediaLayout(value: unknown): ContentMediaLayout {
  if (value === 'centered' || value === 'natural' || value === 'stretch') {
    return value;
  }
  throw new ContentValidationError('Invalid content media layout');
}

export function normalizeContentMediaCaption(value: unknown): string {
  if (typeof value !== 'string') return '';
  return normalizeContentInlineHtml(
    value.replace(/<br\s*\/?>/gi, ' ').replace(/[\r\n]+/g, ' '),
  );
}

function optionalContentMediaCaption(value: unknown): string | undefined {
  return normalizeContentMediaCaption(value) || undefined;
}

function normalizeHeaderText(value: unknown): string {
  const text = normalizeContentText(
    plainText(stringValue(value).replace(/<br\s*\/?>/gi, ' ')),
  );
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeListStyle(value: unknown): string {
  return value === 'ordered' || value === 'checklist' ? value : 'unordered';
}

function normalizeListItems(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const source = isRecord(item) ? item : {};
    return {
      content: normalizeContentInlineHtml(source.content),
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

function collectListPreviewText(parts: string[], items: unknown) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!isRecord(item)) continue;
    appendPreviewText(parts, item.content);
    collectListPreviewText(parts, item.items);
  }
}

function collectGalleryPreviewText(parts: string[], items: unknown) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!isRecord(item)) continue;
    appendPreviewText(parts, item.caption);
  }
}

function appendPreviewText(parts: string[], value: unknown) {
  const text = plainText(value).replace(/\s+/g, ' ').trim();
  if (text) parts.push(text);
}

function contentAssetMedia(value: unknown): MediaDescriptor | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeMediaDescriptor(value.media);
}

function plainText(value: unknown): string {
  return decodeHtmlEntities(stringValue(value).replace(/<[^>]*>/g, '')).trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (entity, decimal: string, hexadecimal: string, name: string) => {
      if (name) return named[name.toLowerCase()] ?? entity;
      const codePoint = Number.parseInt(
        decimal || hexadecimal,
        decimal ? 10 : 16,
      );
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    },
  );
}

function truncatePreviewText(value: string, limit: number): string {
  if (limit <= 0) return '';
  const segments = new Intl.Segmenter(undefined, {
    granularity: 'grapheme',
  }).segment(value);
  return Array.from(segments, ({ segment }) => segment)
    .slice(0, limit)
    .join('');
}

function optionalTrimmedString(value: unknown): string | undefined {
  const text = optionalString(value)?.trim();
  return text || undefined;
}

function optionalNormalizedText(value: unknown): string | undefined {
  const text = normalizeContentText(value);
  return text || undefined;
}

function optionalNormalizedInlineHtml(value: unknown): string | undefined {
  const text = normalizeContentInlineHtml(value);
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
