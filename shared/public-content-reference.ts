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
import { externalLinkIdentity } from './external-link';

/**
 * A link found in content, together with the owner's note about it if there is
 * one. A link mentioned several times is listed once, where it first appears,
 * with the first note written for it: a bare mention neither overrules a note
 * nor hides one written further on.
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
  const linkByKey = new Map<string, ContentReferenceLinkCandidate>();
  const fileKeys = new Set<string>();

  const append = (reference: ContentLinkReference, note?: unknown) => {
    const text = typeof note === 'string' && note ? note : undefined;
    const key = contentLinkReferenceKey(reference);
    const known = linkByKey.get(key);
    if (known) {
      if (!known.note && text) known.note = text;
      return;
    }
    const link: ContentReferenceLinkCandidate = {
      ...reference,
      ...(text ? { note: text } : {}),
    };
    linkByKey.set(key, link);
    links.push(link);
  };
  const appendExternal = (url: string, note?: unknown) =>
    append({ kind: 'external', url }, note);

  for (const [index, block] of data.blocks.entries()) {
    if (block.type === 'privateSectionBoundary') continue;
    if (
      !includePrivate &&
      contentBlockIsInPrivateSection(privateSectionRanges, index)
    )
      continue;

    if (block.type === 'externalLink') {
      appendExternal(block.data.url as string, block.data.note);
    } else if (block.type === 'integration') {
      const url = contentIntegrationUrl(block.data);
      if (url) appendExternal(url);
    } else if (block.type === 'entityLink') {
      const reference = contentEntityReference(
        block.data.entityType,
        block.data.entityId,
      );
      if (reference) append(reference, block.data.note);
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

/**
 * The pages a text links to by address, told apart as a reader tells them
 * (`externalLinkIdentity`): what a list of links kept beside the text would
 * repeat. Private sections count, since their owner reads them too.
 */
export function contentExternalLinkIdentities(
  value: ContentOutputData | null | undefined,
): Set<string> {
  return new Set(
    extractContentReferenceCandidates(value, true).links.flatMap((link) =>
      link.kind === 'external' ? [externalLinkIdentity(link.url)] : [],
    ),
  );
}
