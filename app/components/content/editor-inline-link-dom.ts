import {
  withLinkFragment,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import type EditorJS from '@editorjs/editorjs';
import {
  editableFieldOf,
  markupAround,
} from '#layers/thei/app/composables/editor-inline-dom';
import { writeMarkup } from './editor-edit-commands';

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
  const field = editableFieldOf(node, root);
  if (!field || field.closest('[data-mutation-free="true"]')) return undefined;
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
 * Makes a range a link, as one editing command Ctrl+Z takes back whole: the
 * link it lies in already is put back with the new target, otherwise its
 * words — or `label`, for a range of none — go into a new one. Returns the
 * link now in the text.
 */
export function linkRange(
  range: Range,
  attributes: InlineLinkAttributes,
  label?: string,
): HTMLAnchorElement | undefined {
  const around = markupAround(range.commonAncestorContainer).find(
    (element): element is HTMLAnchorElement =>
      element instanceof HTMLAnchorElement,
  );
  return writeMarkup(
    range,
    around,
    () => document.createElement('a'),
    (link) => {
      applyLinkAttributes(link, attributes);
      if (label && !link.textContent?.trim()) link.textContent = label;
    },
  );
}
