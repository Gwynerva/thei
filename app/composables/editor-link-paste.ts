import type EditorJS from '@editorjs/editorjs';
import type { ContentEntityType } from '#layers/thei/shared/content-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import {
  parseInternalUrl,
  type InternalUrlSite,
} from '#layers/thei/shared/internal-url';
import { trimInlineRange } from '#layers/thei/app/components/content/editor-inline-selection';
import {
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

  async function link(range: Range, target: PastedLinkTarget) {
    if (!bound) return;
    const text = range.toString();
    let attributes: InlineLinkAttributes | undefined;
    if (target.kind === 'internal') {
      const entity = await options
        .findEntity(target.raw)
        .catch(() => undefined);
      // The text may have been edited while the site was asked; a range that
      // no longer holds the same words is left alone.
      if (!bound || !rangeStillHolds(range, text)) return;
      if (entity) attributes = entityLinkAttributes(entity);
      else if (/^https?:\/\//i.test(target.raw)) {
        try {
          const url = normalizeExternalLinkUrl(target.raw);
          attributes = externalLinkAttributes(url);
        } catch {
          // Neither an entity nor an address of its own: nothing to link.
        }
      }
      if (!attributes) {
        // A site path that opens nothing is pasted as the text it is.
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('insertText', false, target.raw);
        return;
      }
    } else {
      attributes = externalLinkAttributes(target.url);
    }
    const element = linkRange(range, attributes);
    placeCaretAfter(element);
    editor.inlineToolbar.close();
  }

  root.addEventListener('paste', onPaste, true);
  root.addEventListener('beforeinput', onBeforeInput, true);
  return () => {
    bound = false;
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
