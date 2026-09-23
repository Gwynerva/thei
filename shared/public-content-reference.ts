import {
  contentBlockIsInPrivateSection,
  contentPrivateSectionRanges,
  normalizeContentData,
  type ContentAssetData,
  type ContentOutputData,
} from './content';
import {
  contentEntityReference,
  contentInlineLinksFromData,
  contentLinkReferenceKey,
  type ContentEntityReference,
  type ContentExternalReference,
  type ContentLinkReference,
} from './content-link';
import { contentIntegrationUrl } from './content-integrations';

/**
 * A link found in content, together with the owner's note about it if there is
 * one. The first mention wins: a note written once should not be overruled by
 * a bare second mention of the same address.
 */
export type ContentReferenceLinkCandidate = { note?: string } & (
  ContentExternalReference | ContentEntityReference
);

export type ContentReferenceFileCandidate = {
  asset: ContentAssetData;
  title?: string;
  caption?: string;
};

export type ContentReferenceCandidates = {
  links: ContentReferenceLinkCandidate[];
  files: ContentReferenceFileCandidate[];
};

export function extractContentReferenceCandidates(
  value: ContentOutputData | null | undefined,
  includePrivate = false,
): ContentReferenceCandidates {
  const data = normalizeContentData(value);
  const privateSectionRanges = contentPrivateSectionRanges(data);
  const links: ContentReferenceLinkCandidate[] = [];
  const files: ContentReferenceFileCandidate[] = [];
  const linkKeys = new Set<string>();
  const fileKeys = new Set<string>();

  const append = (reference: ContentLinkReference, note?: string) => {
    const key = contentLinkReferenceKey(reference);
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ ...reference, ...(note ? { note } : {}) });
  };
  const appendExternal = (url: string, note?: string) =>
    append({ kind: 'external', url }, note);

  for (const [index, block] of data.blocks.entries()) {
    if (block.type === 'privateSectionBoundary') continue;
    if (
      !includePrivate &&
      contentBlockIsInPrivateSection(privateSectionRanges, index)
    )
      continue;

    if (block.type === 'externalLink') {
      appendExternal(block.data.url as string);
    } else if (block.type === 'integration') {
      const url = contentIntegrationUrl(block.data);
      if (url) appendExternal(url);
    } else if (block.type === 'entityLink') {
      const reference = contentEntityReference(
        block.data.entityType,
        block.data.entityId,
      );
      if (reference) append(reference);
    } else if (block.type === 'contentAttachment') {
      const asset = block.data.asset as ContentAssetData | null;
      if (asset) {
        const key = asset.assetUrl || asset.assetUuid;
        if (!fileKeys.has(key)) {
          fileKeys.add(key);
          files.push({
            asset,
            title:
              typeof block.data.title === 'string'
                ? block.data.title
                : undefined,
            caption:
              typeof block.data.caption === 'string'
                ? block.data.caption
                : undefined,
          });
        }
      }
    }

    for (const link of contentInlineLinksFromData({ blocks: [block] })) {
      if (link.kind === 'external') appendExternal(link.url, link.note);
      else
        append(
          {
            kind: 'entity',
            entityType: link.entityType,
            entityId: link.entityId,
          },
          link.note,
        );
    }
  }

  return { links, files };
}
