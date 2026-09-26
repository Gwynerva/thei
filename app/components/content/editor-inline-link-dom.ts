import type { ContentEntityType } from '#layers/thei/shared/content-link';

/**
 * The attributes an inline link is written with. `undefined` removes one, so
 * the same set turns an internal link into an external one and back.
 */
export type InlineLinkAttributes = Record<string, string | undefined>;

/** A link to one of the site's own entities. */
export function entityLinkAttributes(
  entity: { entityType: ContentEntityType; entityId: string; url?: string },
  note?: string,
): InlineLinkAttributes {
  return {
    href: entity.url,
    'data-content-link': 'entity',
    'data-entity-type': entity.entityType,
    'data-entity-id': entity.entityId,
    'data-content-note': note,
  };
}

/** A link to another site, by its normalized address. */
export function externalLinkAttributes(
  url: string,
  note?: string,
): InlineLinkAttributes {
  return {
    href: url,
    'data-content-link': 'external',
    'data-entity-type': undefined,
    'data-entity-id': undefined,
    'data-content-note': note,
  };
}

/** Writes a link's target and note; every link opens in a new tab. */
export function applyLinkAttributes(
  link: HTMLAnchorElement,
  attributes: InlineLinkAttributes,
) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) link.removeAttribute(name);
    else link.setAttribute(name, value);
  }
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener noreferrer');
}

/**
 * A link never holds a link. Text taken over from another link — a selection
 * that began inside one — keeps its words and loses the other link's markup.
 */
export function unwrapNestedLinks(link: HTMLAnchorElement) {
  for (const inner of Array.from(link.querySelectorAll('a')))
    inner.replaceWith(...Array.from(inner.childNodes));
}

/** The link a range lies wholly inside, if any. */
export function linkAroundRange(range: Range): HTMLAnchorElement | undefined {
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest('a') ?? undefined;
}

/**
 * Makes a range a link: the link it already lies in is rewritten, otherwise
 * its content is wrapped in a new one. Returns the link.
 */
export function linkRange(
  range: Range,
  attributes: InlineLinkAttributes,
): HTMLAnchorElement {
  let link = linkAroundRange(range);
  if (!link) {
    link = document.createElement('a');
    link.append(range.extractContents());
    range.insertNode(link);
  }
  unwrapNestedLinks(link);
  applyLinkAttributes(link, attributes);
  return link;
}

/** Puts the caret right after an element. */
export function placeCaretAfter(element: Node) {
  const selection = window.getSelection();
  if (!selection) return;
  const after = document.createRange();
  after.setStartAfter(element);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
}
