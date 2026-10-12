import type EditorJS from '@editorjs/editorjs';
import {
  linkFragment,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import {
  parseInternalUrl,
  type InternalUrlSite,
} from '#layers/thei/shared/internal-url';
import { trimInlineRange } from '#layers/thei/app/components/content/editor-inline-selection';
import {
  applyLinkAttributes,
  entityLinkAttributes,
  externalLinkAttributes,
  linkRange,
  placeCaretAfter,
  type InlineLinkAttributes,
} from '#layers/thei/app/components/content/editor-inline-link-dom';

/**
 * Pasting an address over selected text makes that text a link to it, the
 * way a mail client or a wiki does, instead of replacing the words with the
 * address. An address of this very site becomes an internal link, so it
 * survives a change of domain; any other one an external link, whose chip
 * reads the site the first time it is resolved. A paste that is not one
 * address is left to the editor, and replaces the selection as usual.
 *
 * Every way of pasting arrives as a `paste` event — the keyboard, the
 * context menu, a phone's "Paste". A browser that skips it for its own
 * clipboard strip still announces the insertion as a cancelable
 * `beforeinput`, which is handled the same way.
 *
 * Rich text pasted or dropped from elsewhere brings its links along as bare
 * `<a href>`: they are made links of the editor's own the moment they land,
 * by the same rules, so they look and behave as links at once, not only once
 * the saved text is opened again.
 */

export type PastedLinkTarget =
  { kind: 'internal'; raw: string } | { kind: 'external'; url: string };

/** What a pasted text links to, if it is exactly one address. */
export function pastedLinkTarget(
  text: string,
  site: InternalUrlSite,
): PastedLinkTarget | undefined {
  const raw = text.trim();
  if (!raw || /\s/.test(raw)) return undefined;
  if (parseInternalUrl(raw, site)) return { kind: 'internal', raw };
  if (!/^https?:\/\//i.test(raw)) return undefined;
  try {
    return { kind: 'external', url: normalizeExternalLinkUrl(raw) };
  } catch {
    return undefined;
  }
}

export interface EditorLinkPasteOptions {
  site: InternalUrlSite;
  /** The blocks whose text takes inline links. */
  linkBlocks: ReadonlySet<string>;
  findEntity: (
    url: string,
  ) => Promise<
    | { entityType: ContentEntityType; entityId: string; url?: string }
    | undefined
  >;
}

const PASTE_INPUT_TYPES = new Set([
  'insertFromPaste',
  'insertReplacementText',
  'insertText',
]);

export function bindEditorLinkPaste(
  root: HTMLElement,
  editor: EditorJS,
  options: EditorLinkPasteOptions,
) {
  /** Cleared on unbinding, so an answer that comes later is dropped. */
  let bound = true;

  /**
   * The selection, when it is text of one linkable field and not empty —
   * without the spaces at its edges, which stay outside the link, as they do
   * with the link tools.
   */
  function linkableRange(range: Range | undefined) {
    if (!range || range.collapsed) return undefined;
    const field = editableOf(range.startContainer);
    if (!field || field !== editableOf(range.endContainer)) return undefined;
    if (!root.contains(field) || field.closest('[data-mutation-free="true"]'))
      return undefined;
    const block = editor.blocks.getBlockByElement(field);
    if (!block || !options.linkBlocks.has(block.name)) return undefined;
    const trimmed = trimInlineRange(range);
    return trimmed && !trimmed.collapsed ? trimmed : undefined;
  }

  function onPaste(event: ClipboardEvent) {
    const selection = window.getSelection();
    const range = linkableRange(
      selection?.rangeCount ? selection.getRangeAt(0) : undefined,
    );
    const target =
      range &&
      pastedLinkTarget(
        event.clipboardData?.getData('text/plain') ?? '',
        options.site,
      );
    if (!range || !target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void link(range.cloneRange(), target);
  }

  function onBeforeInput(event: InputEvent) {
    if (!event.cancelable || !PASTE_INPUT_TYPES.has(event.inputType)) return;
    const text = event.dataTransfer?.getData('text/plain') ?? event.data ?? '';
    // Typing sends one character at a time; only a whole address at once is
    // a paste.
    if (event.inputType === 'insertText' && !text.includes('://')) return;
    const staticRange = event.getTargetRanges()[0];
    let range: Range | undefined;
    if (staticRange) {
      range = document.createRange();
      range.setStart(staticRange.startContainer, staticRange.startOffset);
      range.setEnd(staticRange.endContainer, staticRange.endOffset);
    }
    range = linkableRange(range);
    const target = range && pastedLinkTarget(text, options.site);
    if (!range || !target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void link(range, target);
  }

  /**
   * What a link to a target is written with: an address of this site is
   * asked about, and names what it opens. A site path that opens nothing has
   * nothing to link to.
   */
  async function attributesFor(
    target: PastedLinkTarget,
  ): Promise<InlineLinkAttributes | undefined> {
    if (target.kind === 'external') return externalLinkAttributes(target.url);
    const entity = await options.findEntity(target.raw).catch(() => undefined);
    if (entity)
      return entityLinkAttributes(entity, {
        fragment: linkFragment(target.raw),
      });
    if (!/^https?:\/\//i.test(target.raw)) return undefined;
    try {
      return externalLinkAttributes(normalizeExternalLinkUrl(target.raw));
    } catch {
      // Neither an entity nor an address of its own: nothing to link.
      return undefined;
    }
  }

  async function link(range: Range, target: PastedLinkTarget) {
    if (!bound) return;
    const text = range.toString();
    const attributes = await attributesFor(target);
    // The text may have been edited while the site was asked; a range that
    // no longer holds the same words is left alone.
    if (!bound || !rangeStillHolds(range, text)) return;
    if (!attributes) {
      // A site path that opens nothing is pasted as the text it is.
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand(
        'insertText',
        false,
        target.kind === 'internal' ? target.raw : target.url,
      );
      return;
    }
    const element = linkRange(range, attributes);
    placeCaretAfter(element);
    editor.inlineToolbar.close();
  }

  /** The anchors being made links, so that none is asked about twice. */
  const adopting = new WeakSet<HTMLAnchorElement>();

  /**
   * A bare link that rich text brought into a linkable field: one with a web
   * address and nothing of the editor's own. A relative address is left
   * alone, as storage keeps it; so is every link the editor made, which is
   * all a saved text holds, so opening one changes nothing.
   */
  function bareLink(anchor: HTMLAnchorElement) {
    if (adopting.has(anchor) || anchor.hasAttribute('data-content-link'))
      return undefined;
    const href = anchor.getAttribute('href')?.trim() ?? '';
    if (!/^https?:\/\//i.test(href)) return undefined;
    const field = editableOf(anchor);
    if (!field || !root.contains(field)) return undefined;
    if (field.closest('[data-mutation-free="true"]')) return undefined;
    const block = editor.blocks.getBlockByElement(field);
    return block && options.linkBlocks.has(block.name) ? href : undefined;
  }

  async function adopt(anchor: HTMLAnchorElement, href: string) {
    const target = pastedLinkTarget(href, options.site);
    if (!target) return;
    adopting.add(anchor);
    try {
      const attributes = await attributesFor(target);
      // Removed, rewritten or made a link by hand while the site was asked:
      // the link is no longer the one that was pasted.
      const unchanged =
        anchor.isConnected &&
        !anchor.hasAttribute('data-content-link') &&
        anchor.getAttribute('href')?.trim() === href;
      if (bound && unchanged && attributes)
        applyLinkAttributes(anchor, attributes);
    } finally {
      adopting.delete(anchor);
    }
  }

  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const anchors = node.matches('a')
          ? [node as HTMLAnchorElement]
          : Array.from(node.querySelectorAll<HTMLAnchorElement>('a'));
        for (const anchor of anchors) {
          const href = bareLink(anchor);
          if (href) void adopt(anchor, href);
        }
      }
  });

  root.addEventListener('paste', onPaste, true);
  root.addEventListener('beforeinput', onBeforeInput, true);
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    bound = false;
    observer.disconnect();
    root.removeEventListener('paste', onPaste, true);
    root.removeEventListener('beforeinput', onBeforeInput, true);
  };
}

function editableOf(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>('[contenteditable="true"]') ?? undefined;
}

function rangeStillHolds(range: Range, text: string) {
  return (
    range.startContainer.isConnected &&
    range.endContainer.isConnected &&
    range.toString() === text
  );
}
