import type EditorJS from '@editorjs/editorjs';
import {
  editableFieldOf,
  insertInlineElement,
  placeCaretAfter,
  runEditCommand,
  selectRange,
  writeBesideElement,
} from '../components/content/editor-edit-commands';
import {
  applyLinkAttributes,
  highlightWords,
  linkableFieldOf,
} from '../components/content/editor-inline-link-dom';
import type { ContentInlineLinkRequest } from '../components/content/editor-inline-links';
import { typedAt } from './at-trigger';
import { edgeInside, edgeOutside } from './editor-inline-boundary';
import { rangeAnchor } from './popup-placement';

/** The `@` in accent while its popup is open. */
const AT_HIGHLIGHT = 'content-editor-at';
/** On the editor while a link just made takes what is typed: no toolbar. */
const FRESH_CLASS = 'content-editor--fresh-link';

/** A space or a mark: typed after a name, it keeps the name. */
const KEEPS_NAME = /^[\s\p{P}]/u;

export interface EditorAtLinkOptions {
  /** The blocks whose text takes inline links. */
  linkBlocks: ReadonlySet<string>;
  open: (request: ContentInlineLinkRequest) => void;
}

/**
 * A link made while typing: an `@` that stands alone in a text that takes
 * links opens the link popup beside it, and turns accent while it is open.
 *
 * Given up — Escape, a click elsewhere — the `@` stays as typed, followed
 * by whatever was typed in the popup's search, as if there had been no
 * popup. Chosen, the `@` becomes the link, named after what it leads to,
 * and that name is selected: words typed go on in its place, inside the
 * link; a space or a mark keeps the name and is typed after it. Nothing is
 * written while the popup is open, so the text and its save button stay as
 * they are until something is chosen.
 */
export function bindEditorAtLink(
  root: HTMLElement,
  editor: EditorJS,
  options: EditorAtLinkOptions,
) {
  /**
   * The link just made: what is typed over its name, and right after it,
   * goes into it, until the caret leaves its end. The browser would type the
   * second letter outside: it keeps clear of a link's edge.
   */
  let fresh: HTMLAnchorElement | undefined;
  /**
   * A word being composed over its name or after it: the words it is to
   * follow, none when it replaces the name.
   */
  let composing: { link: HTMLAnchorElement; base: string } | undefined;

  // Its name is selected to be typed over, not to be formatted: Editor.js's
  // toolbar, which the selection calls up, is hidden and put away at once.
  const toolbar = new MutationObserver(() => {
    if (fresh && root.querySelector('.ce-inline-toolbar .ce-popover--opened'))
      editor.inlineToolbar.close();
  });

  function setFresh(link: HTMLAnchorElement | undefined) {
    fresh = link;
    root.classList.toggle(FRESH_CLASS, Boolean(link));
    toolbar.disconnect();
    if (link)
      toolbar.observe(root, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
  }

  function freshCaret(link: HTMLAnchorElement): 'whole' | 'end' | undefined {
    const selection = window.getSelection();
    if (!link.isConnected || !selection?.rangeCount) return undefined;
    const range = selection.getRangeAt(0);
    const words = link.textContent ?? '';
    if (!range.collapsed)
      return words && range.toString() === words && range.intersectsNode(link)
        ? 'whole'
        : undefined;
    return edgeInside(range, 'after') === link ||
      edgeOutside(range, 'after') === link
      ? 'end'
      : undefined;
  }

  /** The fresh link put back with these words, the caret at their end. */
  function rename(range: Range, link: HTMLAnchorElement, words: string) {
    const next = link.cloneNode(false) as HTMLAnchorElement;
    next.textContent = words;
    const placed = insertInlineElement(range, next);
    if (!(placed instanceof HTMLAnchorElement) || !placed.lastChild) {
      setFresh(undefined);
      return;
    }
    const end = document.createRange();
    end.setStart(placed.lastChild, (placed.lastChild as Text).length);
    end.collapse(true);
    selectRange(end);
    setFresh(placed);
  }

  function onBeforeInput(event: InputEvent) {
    const link = fresh;
    if (!link || event.defaultPrevented) return;
    const type = event.inputType;
    // A word being composed cannot be stopped; it is moved in once done.
    if (type === 'insertCompositionText' || type.startsWith('delete')) return;
    const where = freshCaret(link);
    if (
      !where ||
      !event.cancelable ||
      (type !== 'insertText' && type !== 'insertReplacementText')
    ) {
      setFresh(undefined);
      return;
    }
    // A suggestion for another word than the link's is the browser's.
    if (type === 'insertReplacementText') {
      const target = event.getTargetRanges()[0];
      const aimed =
        target &&
        (target.collapsed ||
          (where === 'whole' &&
            link.contains(target.startContainer) &&
            link.contains(target.endContainer)));
      if (!aimed) {
        setFresh(undefined);
        return;
      }
    }
    const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
    if (!text) return;
    event.preventDefault();
    if (where === 'whole' && KEEPS_NAME.test(text)) {
      setFresh(undefined);
      writeBesideElement(link, text, 'after');
      return;
    }
    const whole = document.createRange();
    whole.selectNode(link);
    rename(
      whole,
      link,
      where === 'whole' ? text : (link.textContent ?? '') + text,
    );
  }

  function onCompositionStart() {
    const where = fresh && freshCaret(fresh);
    composing =
      fresh && where
        ? {
            link: fresh,
            base: where === 'whole' ? '' : (fresh.textContent ?? ''),
          }
        : undefined;
  }

  function onCompositionEnd(event: CompositionEvent) {
    const state = composing;
    composing = undefined;
    const data = event.data;
    if (!state || !data) return;
    const { link, base } = state;
    if (link.isConnected) {
      const inside = link.textContent ?? '';
      // Typed into it, as wanted: it goes on taking what is typed.
      if (inside === base + data) {
        setFresh(link);
        return;
      }
      // The browser keeps clear of a link's edge: the word, or the rest of
      // it, went in right after the link. Taken in.
      if (!inside.startsWith(base)) return;
      const begun = inside.slice(base.length);
      if (!data.startsWith(begun)) return;
      const rest = data.slice(begun.length);
      const after = link.nextSibling;
      if (after?.nodeType !== Node.TEXT_NODE) return;
      if (!(after as Text).data.startsWith(rest)) return;
      const range = document.createRange();
      range.setStartBefore(link);
      range.setEnd(after, rest.length);
      rename(range, link, base + data);
      return;
    }
    // Composed over its whole name, which took the link away: put back.
    const selection = window.getSelection();
    const caret = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    const node = caret?.startContainer;
    if (!caret?.collapsed || node?.nodeType !== Node.TEXT_NODE) return;
    const offset = caret.startOffset;
    if ((node as Text).data.slice(offset - data.length, offset) !== data)
      return;
    const range = document.createRange();
    range.setStart(node, offset - data.length);
    range.setEnd(node, offset);
    rename(range, link, data);
  }

  function onKeyDown(event: KeyboardEvent) {
    const link = fresh;
    if (!link || composing) return;
    if (event.key === 'Escape' && freshCaret(link)) {
      // Let go of: what is typed next follows the link.
      event.preventDefault();
      event.stopPropagation();
      setFresh(undefined);
      placeCaretAfter(link);
      return;
    }
    if (
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'Tab',
        'Enter',
      ].includes(event.key)
    )
      setFresh(undefined);
  }

  function onSelectionChange() {
    // While a word is composed the caret moves with it: it is looked at once
    // the word is done.
    if (fresh && !composing && !freshCaret(fresh)) setFresh(undefined);
  }

  function openAt(at: Range, field: HTMLElement) {
    highlightWords(AT_HIGHLIGHT, at);
    let settled = false;
    options.open({
      anchor: rangeAnchor(at, field),
      existing: false,
      selectionText: '',
      remove: () => {},
      restore: (typed) => {
        if (settled) return;
        settled = true;
        highlightWords(AT_HIGHLIGHT);
        if (!at.startContainer.isConnected) return;
        field.focus({ preventScroll: true });
        const caret = document.createRange();
        caret.setStart(at.endContainer, at.endOffset);
        caret.collapse(true);
        selectRange(caret);
        if (typed) runEditCommand('insertText', typed);
      },
      apply: (label, attributes) => {
        if (settled) return;
        settled = true;
        highlightWords(AT_HIGHLIGHT);
        if (!at.startContainer.isConnected || at.toString() !== '@') return;
        field.focus({ preventScroll: true });
        const element = document.createElement('a');
        applyLinkAttributes(element, attributes);
        element.textContent = label;
        const link = insertInlineElement(at, element);
        if (!link) return;
        const words = document.createRange();
        words.selectNodeContents(link);
        selectRange(words);
        setFresh(link as HTMLAnchorElement);
      },
    });
  }

  function onInput(event: Event) {
    // The `@` first, which nearly no input is: the block is asked about
    // only then.
    const typedIn = editableFieldOf(window.getSelection()?.anchorNode);
    const at = typedIn && typedAt(event, typedIn);
    if (!at || at.startContainer.parentElement?.closest('a')) return;
    const field = linkableFieldOf(root, editor, options.linkBlocks, typedIn);
    if (field) openAt(at, field);
  }

  const forget = () => setFresh(undefined);
  root.addEventListener('input', onInput);
  root.addEventListener('beforeinput', onBeforeInput, true);
  root.addEventListener('compositionstart', onCompositionStart, true);
  root.addEventListener('compositionend', onCompositionEnd, true);
  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('pointerdown', forget, true);
  root.addEventListener('focusout', forget);
  document.addEventListener('selectionchange', onSelectionChange);
  return () => {
    root.removeEventListener('input', onInput);
    root.removeEventListener('beforeinput', onBeforeInput, true);
    root.removeEventListener('compositionstart', onCompositionStart, true);
    root.removeEventListener('compositionend', onCompositionEnd, true);
    root.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener('pointerdown', forget, true);
    root.removeEventListener('focusout', forget);
    document.removeEventListener('selectionchange', onSelectionChange);
    setFresh(undefined);
    toolbar.disconnect();
    highlightWords(AT_HIGHLIGHT);
  };
}
