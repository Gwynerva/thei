import type EditorJS from '@editorjs/editorjs';
import {
  insertInlineElement,
  runEditCommand,
  selectRange,
} from '../components/content/editor-edit-commands';
import {
  applyLinkAttributes,
  highlightWords,
  linkableFieldOf,
} from '../components/content/editor-inline-link-dom';
import type { ContentInlineLinkRequest } from '../components/content/editor-inline-links';
import { typedAt } from './at-trigger';
import { editableFieldOf } from './editor-inline-dom';
import type { EditorInlineKeep } from './editor-inline-keep';
import { guardInlineToolbar } from './editor-plain-fields';
import { rangeAnchor } from './popup-placement';

/** The `@` in accent while its popup is open. */
const AT_HIGHLIGHT = 'content-editor-at';
/** On the editor while a link just made offers its name: no toolbar. */
const FRESH_CLASS = 'content-editor--fresh-link';

/** A space or a mark: typed after a name, it keeps the name. */
const KEEPS_NAME = /^[\s\p{P}]/u;

export interface EditorAtLinkOptions {
  /** The blocks whose text takes inline links. */
  linkBlocks: ReadonlySet<string>;
  open: (request: ContentInlineLinkRequest) => void;
  /** Markup that outlives its words, and offers the name of a link made. */
  inline: EditorInlineKeep;
}

/**
 * A link made while typing: an `@` that stands alone in a text that takes
 * links opens the link popup beside it, and turns accent while it is open.
 *
 * Given up — Escape, a click elsewhere — the `@` stays as typed, followed
 * by whatever was typed in the popup's search, as if there had been no
 * popup. Chosen, the `@` becomes the link, named after what it leads to,
 * and that name is selected: words typed go on in its place, inside the
 * link, as over the words of any markup (`editor-inline-keep.ts`); a space
 * or a mark keeps the name and is typed after it. Nothing is written while
 * the popup is open, so the text and its save button stay as they are
 * until something is chosen.
 */
export function bindEditorAtLink(
  root: HTMLElement,
  editor: EditorJS,
  options: EditorAtLinkOptions,
) {
  // Its name is selected to be typed over, not to be formatted: Editor.js's
  // toolbar, which the selection calls up, is hidden and put away at once.
  let fresh = false;
  const unguard = guardInlineToolbar(root, editor, () => fresh);

  function setFresh(value: boolean) {
    fresh = value;
    root.classList.toggle(FRESH_CLASS, value);
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
        // Offering it lets go of a name offered before, toolbar and all.
        options.inline.offer(link, {
          acceptedBy: KEEPS_NAME,
          onRelease: () => setFresh(false),
        });
        setFresh(true);
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

  root.addEventListener('input', onInput);
  return () => {
    root.removeEventListener('input', onInput);
    setFresh(false);
    unguard();
    highlightWords(AT_HIGHLIGHT);
  };
}
