import { normalizeContentData, type ContentOutputData } from './content';
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
 * What a text links to, as the owner's forms read it beside the text: the
 * pages a list of links would repeat, the entities a relation might join.
 * Private sections count, since their owner wrote them. A visitor's page
 * reads the links in the text itself, never a list of them.
 */

/**
 * A link a text makes, with the owner's note on it if there is one. A link
 * made several times is listed once, where it first appears, with the first
 * note written for it: a bare mention neither overrules a note nor hides one
 * written further on.
 */
export type ContentLinkMention = { note?: string } & (
  ContentExternalReference | ContentEntityReference
);

export function contentLinkMentions(
  value: ContentOutputData | null | undefined,
): ContentLinkMention[] {
  const data = normalizeContentData(value);
  const links: ContentLinkMention[] = [];
  const linkByKey = new Map<string, ContentLinkMention>();

  const append = (reference: ContentLinkReference, note?: unknown) => {
    const text = typeof note === 'string' && note ? note : undefined;
    const key = contentLinkReferenceKey(reference);
    const known = linkByKey.get(key);
    if (known) {
      if (!known.note && text) known.note = text;
      return;
    }
    const link: ContentLinkMention = {
      ...reference,
      ...(text ? { note: text } : {}),
    };
    linkByKey.set(key, link);
    links.push(link);
  };
  const appendExternal = (url: string, note?: unknown) =>
    append({ kind: 'external', url }, note);

  for (const block of data.blocks) {
    if (block.type === 'privateSectionBoundary') continue;
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

  return links;
}

/**
 * The pages a text links to by address, told apart as a reader tells them
 * (`externalLinkIdentity`): what a list of links kept beside the text would
 * repeat.
 */
export function contentExternalLinkIdentities(
  value: ContentOutputData | null | undefined,
): Set<string> {
  return new Set(
    contentLinkMentions(value).flatMap((link) =>
      link.kind === 'external' ? [externalLinkIdentity(link.url)] : [],
    ),
  );
}

/**
 * The entities a text links to, each once, in the order the text first names
 * them: what the owner already points at, and may well want to relate to.
 */
export function contentEntityMentions(
  value: ContentOutputData | null | undefined,
): ContentEntityReference[] {
  return contentLinkMentions(value).flatMap((link) =>
    link.kind === 'entity'
      ? [
          {
            kind: 'entity' as const,
            entityType: link.entityType,
            entityId: link.entityId,
          },
        ]
      : [],
  );
}
