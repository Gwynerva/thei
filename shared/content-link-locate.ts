import {
  contentBlockIsInPrivateSection,
  normalizedContentPrivateSectionRanges,
  type ContentOutputBlock,
  type ContentOutputData,
} from './content';
import { contentTextFields } from './content-edit-markdown/patch-core';
import { theiLinkUrl } from './content-edit-markdown/links';
import {
  decodeHtmlEntities,
  escapeHtmlAttribute,
} from './content-edit-markdown/html';
import {
  contentEntityReference,
  normalizeContentInlineHtml,
  normalizeLinkFragment,
  parseHtmlAttributes,
  type ContentEntityType,
} from './content-link';

/**
 * The links of a text to the site's own entities, each by where it stands —
 * its block, its field, its order among the field's links; a link block by
 * the block — and one pointed elsewhere there, or taken off and its words
 * kept. An order moves when a link before it in its field goes, so what is
 * kept to find a link again later is `ContentLinkPlace`: its field, where it
 * leads and its words, which move with it.
 */

/** Where a link leads: an entity, and a place inside it. */
export interface ContentLinkTarget {
  entityType: ContentEntityType;
  entityId: string;
  fragment?: string;
}

export interface LocatedContentLink extends ContentLinkTarget {
  id: string;
  /** The block, by its place among the text's blocks. */
  block: number;
  /** A link of words, or a link block's card. */
  kind: 'inline' | 'card';
  /** Its words as a reader sees them; a card has none. */
  words: string;
  /** Inside a private section of the text. */
  private: boolean;
}

const LINK = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

function blockKey(block: ContentOutputBlock, index: number) {
  return block.id ?? `@${index}`;
}

function plain(html: string) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** A link of words to an entity, from its tag's attributes. */
function entityTarget(source: string): ContentLinkTarget | undefined {
  const attributes = parseHtmlAttributes(source);
  if (attributes['data-content-link'] !== 'entity') return undefined;
  const reference = contentEntityReference(
    attributes['data-entity-type'],
    attributes['data-entity-id'],
  );
  if (!reference) return undefined;
  const fragment = normalizeLinkFragment(attributes['data-entity-fragment']);
  return {
    entityType: reference.entityType,
    entityId: reference.entityId,
    ...(fragment ? { fragment } : {}),
  };
}

function cardTarget(block: ContentOutputBlock): ContentLinkTarget | undefined {
  const data = block.data as Record<string, unknown>;
  const reference = contentEntityReference(data.entityType, data.entityId);
  if (!reference) return undefined;
  const fragment = normalizeLinkFragment(data.fragment);
  return {
    entityType: reference.entityType,
    entityId: reference.entityId,
    ...(fragment ? { fragment } : {}),
  };
}

/** Every link of the text to an entity, in the order they stand. */
export function locateContentEntityLinks(
  data: ContentOutputData,
): LocatedContentLink[] {
  const ranges = normalizedContentPrivateSectionRanges(data);
  const found: LocatedContentLink[] = [];
  data.blocks.forEach((block, index) => {
    const key = blockKey(block, index);
    const place = {
      block: index,
      private: contentBlockIsInPrivateSection(ranges, index),
    };
    if (block.type === 'entityLink') {
      const target = cardTarget(block);
      if (target)
        found.push({
          ...target,
          ...place,
          id: `${key}/card`,
          kind: 'card',
          words: '',
        });
      return;
    }
    contentTextFields(block).forEach((field, fieldIndex) => {
      if (!field.html) return;
      let order = 0;
      for (const match of field.get().matchAll(LINK)) {
        const target = entityTarget(match[1] ?? '');
        if (!target) continue;
        found.push({
          ...target,
          ...place,
          id: `${key}/${fieldIndex}/${order++}`,
          kind: 'inline',
          words: plain(match[2] ?? ''),
        });
      }
    });
  });
  return found;
}

/**
 * A link as it can be found again: the place it stood at, and its target and
 * words — the `nth` of the links of its field that lead there with them.
 */
export interface ContentLinkPlace {
  link: string;
  from: string;
  words: string;
  nth: number;
}

/** The field a link's place names: its block, and its field there. */
function fieldOf(id: string) {
  return id.endsWith('/card') ? id : id.slice(0, id.lastIndexOf('/') + 1);
}

/** The links of a field leading to `to` with these words, in their order. */
function sameLinks(
  data: ContentOutputData,
  field: string,
  to: string,
  words: string,
) {
  return locateContentEntityLinks(data).filter(
    (link) =>
      fieldOf(link.id) === field &&
      link.words === words &&
      theiLinkUrl(link) === to,
  );
}

/** How a link is found again: `nth` among its field's alike. */
export function contentLinkPlace(
  data: ContentOutputData,
  link: LocatedContentLink,
): ContentLinkPlace {
  const from = theiLinkUrl(link);
  return {
    link: link.id,
    from,
    words: link.words,
    nth: sameLinks(data, fieldOf(link.id), from, link.words).findIndex(
      (item) => item.id === link.id,
    ),
  };
}

/** The link a place names, while it still leads where it did. */
export function contentLinkFrom(
  data: ContentOutputData,
  place: ContentLinkPlace,
): LocatedContentLink | undefined {
  return sameLinks(data, fieldOf(place.link), place.from, place.words)[
    place.nth
  ];
}

/** Whether the field of a place has a link to `to` with its words. */
export function contentLinkLeads(
  data: ContentOutputData,
  place: ContentLinkPlace,
  to: string,
) {
  return sameLinks(data, fieldOf(place.link), to, place.words).length > 0;
}

/** A link of the text by where it stands now, if it is there. */
export function contentLinkAt(
  data: ContentOutputData,
  id: string,
): LocatedContentLink | undefined {
  return locateContentEntityLinks(data).find((link) => link.id === id);
}

/**
 * A copy of the text with the words of one link wrapped by `wrap` — for a
 * page to show which link a part is about — or the text as it is, when no
 * link of words stands there.
 */
export function markContentLink(
  data: ContentOutputData,
  id: string,
  wrap: (inner: string) => string,
): ContentOutputData {
  const copy = structuredClone(data);
  const [key, second, third] = id.split('/');
  const block = copy.blocks.find(
    (item, place) => blockKey(item, place) === key,
  );
  const field = block ? contentTextFields(block)[Number(second)] : undefined;
  if (!field?.html) return data;
  let order = 0;
  field.set(
    field
      .get()
      .replace(LINK, (whole, attributes, inner) =>
        entityTarget(attributes) && order++ === Number(third)
          ? `<a${attributes}>${wrap(inner)}</a>`
          : whole,
      ),
  );
  return copy;
}

/**
 * The text with one link pointed at `to` — or, for `null`, its words left
 * without it — and nothing else changed: its words, its note and every other
 * link stay. Undefined when no link stands at that place; a link block is
 * pointed elsewhere, never taken off.
 */
export function retargetContentLink(
  data: ContentOutputData,
  id: string,
  to: ContentLinkTarget | null,
): ContentOutputData | undefined {
  const copy = structuredClone(data);
  const [key, second, third] = id.split('/');
  const index = copy.blocks.findIndex(
    (block, place) => blockKey(block, place) === key,
  );
  const block = copy.blocks[index];
  if (!block) return undefined;
  if (second === 'card') {
    if (!to || block.type !== 'entityLink' || !cardTarget(block))
      return undefined;
    const card = block.data as Record<string, unknown>;
    card.entityType = to.entityType;
    card.entityId = to.entityId;
    if (to.fragment) card.fragment = to.fragment;
    else delete card.fragment;
    return copy;
  }
  const field = contentTextFields(block)[Number(second)];
  const wanted = Number(third);
  if (!field?.html || !Number.isInteger(wanted)) return undefined;
  let order = 0;
  let done = false;
  const value = field.get().replace(LINK, (whole, attributes, inner) => {
    if (done || !entityTarget(attributes)) return whole;
    if (order++ !== wanted) return whole;
    done = true;
    if (!to) return inner;
    const note = parseHtmlAttributes(attributes)['data-content-note'];
    return `<a data-content-link="entity" data-entity-type="${to.entityType}" data-entity-id="${escapeHtmlAttribute(to.entityId)}"${to.fragment ? ` data-entity-fragment="${escapeHtmlAttribute(to.fragment)}"` : ''}${note ? ` data-content-note="${escapeHtmlAttribute(note)}"` : ''}>${inner}</a>`;
  });
  if (!done) return undefined;
  field.set(normalizeContentInlineHtml(value));
  return copy;
}
