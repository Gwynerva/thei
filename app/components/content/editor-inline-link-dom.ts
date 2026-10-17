import {
  withLinkFragment,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import type EditorJS from '@editorjs/editorjs';
import { editableFieldOf, insertInlineElement } from './editor-edit-commands';

/**
 * Marks words of the text with a highlight of `editor.css`, or takes the
 * mark away: drawn over the text, never written into it, so Ctrl+Z has
 * nothing of it to undo and the text is not changed.
 */
export function highlightWords(name: string, range?: Range) {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
  if (range) CSS.highlights.set(name, new Highlight(range));
  else CSS.highlights.delete(name);
}

/**
 * The editor's text field a node is in, when that text takes links: one of
 * `linkBlocks`, and none a block draws itself, outside Editor.js's watch.
 */
export function linkableFieldOf(
  root: HTMLElement,
  editor: EditorJS,
  linkBlocks: ReadonlySet<string>,
  node: Node | null | undefined,
): HTMLElement | undefined {
  const field = editableFieldOf(node);
  if (
    !field ||
    !root.contains(field) ||
    field.closest('[data-mutation-free="true"]')
  )
    return undefined;
  const block = editor.blocks.getBlockByElement(field);
  return block && linkBlocks.has(block.name) ? field : undefined;
}

/**
 * The attributes an inline link is written with. `undefined` removes one, so
 * the same set turns an internal link into an external one and back.
 */
export type InlineLinkAttributes = Record<string, string | undefined>;

/**
 * A link to one of the site's own entities, to the place inside it a
 * `fragment` names, if any. The address is only for the editor to show:
 * storage keeps the entity and the fragment, never the address.
 */
export function entityLinkAttributes(
  entity: { entityType: ContentEntityType; entityId: string; url?: string },
  { note, fragment }: { note?: string; fragment?: string } = {},
): InlineLinkAttributes {
  return {
    href: entity.url && withLinkFragment(entity.url, fragment),
    'data-content-link': 'entity',
    'data-entity-type': entity.entityType,
    'data-entity-id': entity.entityId,
    'data-entity-fragment': fragment,
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
    'data-entity-fragment': undefined,
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
function linkAroundRange(range: Range): HTMLAnchorElement | undefined {
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest('a') ?? undefined;
}

/**
 * Makes a range a link: the link it already lies in is rewritten, otherwise
 * its content is wrapped in a new one, put in as one editing command that
 * Ctrl+Z takes back whole. Returns the link, if it is in the text.
 */
export function linkRange(
  range: Range,
  attributes: InlineLinkAttributes,
): HTMLAnchorElement | undefined {
  const around = linkAroundRange(range);
  if (around) {
    unwrapNestedLinks(around);
    applyLinkAttributes(around, attributes);
    return around;
  }
  const link = document.createElement('a');
  link.append(range.cloneContents());
  unwrapNestedLinks(link);
  applyLinkAttributes(link, attributes);
  return insertInlineElement(range, link) as HTMLAnchorElement | undefined;
}
