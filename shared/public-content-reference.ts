import {
  contentBlockIsInPrivateSection,
  contentPrivateSectionRanges,
  normalizeContentData,
  type ContentAssetData,
  type ContentOutputData,
} from './content';
import { contentInlineLinksFromData } from './content-link';
import { contentIntegrationUrl } from './content-integrations';

/**
 * A link found in content, together with the owner's note about it if there is
 * one. The first mention wins: a note written once should not be overruled by
 * a bare second mention of the same address.
 */
export type ContentReferenceLinkCandidate = { note?: string } & (
  | { kind: 'external'; url: string }
  | { kind: 'project'; projectUuid: string }
  | { kind: 'event'; eventUuid: string }
  | { kind: 'page'; pageUuid: string }
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

  const appendExternal = (url: string, note?: string) => {
    const key = `external:${url}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ kind: 'external', url, ...(note ? { note } : {}) });
  };
  const appendProject = (projectUuid: string, note?: string) => {
    const key = `project:${projectUuid}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ kind: 'project', projectUuid, ...(note ? { note } : {}) });
  };
  const appendEvent = (eventUuid: string, note?: string) => {
    const key = `event:${eventUuid}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ kind: 'event', eventUuid, ...(note ? { note } : {}) });
  };
  const appendPage = (pageUuid: string, note?: string) => {
    const key = `page:${pageUuid}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ kind: 'page', pageUuid, ...(note ? { note } : {}) });
  };

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
    } else if (
      block.type === 'entityLink' &&
      (block.data.entityType === 'project' ||
        block.data.entityType === 'event' ||
        block.data.entityType === 'page') &&
      typeof block.data.entityId === 'string'
    ) {
      if (block.data.entityType === 'project')
        appendProject(block.data.entityId);
      else if (block.data.entityType === 'event')
        appendEvent(block.data.entityId);
      else appendPage(block.data.entityId);
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
      else if (link.entityType === 'project')
        appendProject(link.entityId, link.note);
      else if (link.entityType === 'event')
        appendEvent(link.entityId, link.note);
      else appendPage(link.entityId, link.note);
    }
  }

  return { links, files };
}
