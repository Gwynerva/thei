import {
  editCommandRunning,
  runEditCommand,
} from '#layers/thei/app/components/content/editor-edit-commands';
import { BLOCK_DRAG_MIME } from './editor-block-drag';
import { EDITOR_JS_CLIPBOARD_MIME } from './editor-dom';
import {
  caretAtPoint,
  rangeOf,
  textFieldOf,
  wordsBeside,
} from './editor-inline-dom';
import { BLOCK_ELEMENTS } from './editor-text-drop';
import {
  smartTypographyRun,
  smartTypographyText,
  type PasteTypographyContext,
} from './smart-typography';

/**
 * Words pasted or dropped into the editor get the typography typing gives
 * them — a dash for two hyphens, an ellipsis for three dots — by the paste
 * rules of `smart-typography.ts`, whichever way they come in.
 *
 * It is done once, at the door: the first listener of a paste or a drop on
 * the editor reads what the clipboard holds, and when its words change,
 * gives the event a copy with the new words in place of the clipboard's
 * own. Everything that takes a paste after it — the words written in at the
 * caret, the blocks Editor.js makes of several paragraphs, an address made a
 * link, the fields of a block — reads the copy and is none the wiser. What
 * goes in is still one editing command, so Ctrl+Z takes back the paste and
 * its typography in one step.
 *
 * Left exactly as they come: a paste with nothing to format, which goes the
 * way it always went; blocks copied from the editor itself, and words copied
 * or cut from a text of it, or dragged within it, whose words are already as
 * the owner left them — two hyphens kept on purpose by a Backspace stay two
 * hyphens when they are cut and pasted back; and web addresses, inside a
 * text or alone, which the rules never touch — so an address pasted over
 * words still makes a link. Only the words of rich text change, never an
 * attribute, and never what is marked as code.
 */

/** Text that is not prose: its words stay as written. */
const VERBATIM =
  'script, style, noscript, template, title, code, pre, kbd, samp';

/**
 * Words as a clipboard holds them and as a selection reads, made alike:
 * the browser writes a copy's plain text by rules of its own — a no-break
 * space as a space, a paragraph's end as a line break — so spaces of every
 * kind and line breaks count as one space, and the ends as none.
 */
export function clipboardWordsKey(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The words last copied or cut from a text of an editor on the page — any
 * editor's, so words carried from one text to another are the owner's
 * too. A clipboard cannot be tagged without writing the whole copy anew, so
 * a paste is known for them by its words.
 */
let copiedWords: string | undefined;

/** Remembers the words of a copy or a cut from an editor's text. */
export function rememberCopiedWords(text: string) {
  copiedWords = clipboardWordsKey(text) || undefined;
}

/** Whether a paste brings back the words last copied or cut in an editor. */
export function bringsCopiedWords(text: string) {
  return copiedWords !== undefined && clipboardWordsKey(text) === copiedWords;
}

/**
 * Formats the words under a node in place, read a paragraph at a time: a
 * block-level element or a line break ends the words that came before it.
 * The first paragraph is read after `context.before`, the last before
 * `context.after`. True when anything changed.
 */
export function formatTextNodes(
  root: Node,
  context: PasteTypographyContext = {},
): boolean {
  const document = root.ownerDocument ?? (root as Document);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  const runs: { node: Text; verbatim: boolean }[][] = [];
  let run: { node: Text; verbatim: boolean }[] = [];
  let block: Element | null | undefined;
  const close = () => {
    if (run.length) runs.push(run);
    run = [];
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).matches(`br, ${BLOCK_ELEMENTS}`)) close();
      continue;
    }
    const parent = node.parentElement;
    const own = parent?.closest(BLOCK_ELEMENTS);
    if (own !== block) close();
    block = own;
    run.push({
      node: node as Text,
      verbatim: Boolean(parent?.closest(VERBATIM)),
    });
  }
  close();
  // The spaces between the tags of clipboard HTML are no paragraph: the
  // words beside the paste are read by the first and the last with words.
  const worded = runs.filter((texts) =>
    texts.some(({ node }) => /\S/.test(node.data)),
  );

  let changed = false;
  worded.forEach((texts, index) => {
    const next = smartTypographyRun(
      texts.map(({ node }) => node.data),
      {
        before: index === 0 ? context.before : undefined,
        after: index === worded.length - 1 ? context.after : undefined,
      },
    );
    texts.forEach(({ node, verbatim }, at) => {
      if (verbatim || next[at] === node.data) return;
      node.data = next[at]!;
      changed = true;
    });
  });
  return changed;
}

/**
 * Clipboard HTML with its words formatted; the same string when nothing
 * changed. A whole document stays a whole document, and a fragment a
 * fragment, so whatever reads it next finds what it would have found.
 */
export function formatClipboardHtml(
  html: string,
  context: PasteTypographyContext = {},
) {
  if (!html.trim()) return html;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  if (!formatTextNodes(parsed.body, context)) return html;
  return /<html[\s>]/i.test(html)
    ? parsed.documentElement.outerHTML
    : parsed.head.innerHTML + parsed.body.innerHTML;
}

/**
 * A copy of what a paste or a drop carries, its words formatted, its other
 * kinds of data and its files as they were; nothing when there is nothing
 * to format, when it is blocks copied from the editor, or when the browser
 * cannot make a copy — and the paste then goes in as it is.
 */
export function formattedTransfer(
  data: DataTransfer,
  context: PasteTypographyContext = {},
): DataTransfer | undefined {
  if (data.types.includes(EDITOR_JS_CLIPBOARD_MIME)) return undefined;
  const text = data.getData('text/plain');
  const html = data.getData('text/html');
  const formattedText = smartTypographyText(text, context);
  const formattedHtml = formatClipboardHtml(html, context);
  if (formattedText === text && formattedHtml === html) return undefined;
  let copy: DataTransfer;
  try {
    copy = new DataTransfer();
    for (const type of data.types) {
      if (type === 'Files') continue;
      copy.setData(
        type,
        type === 'text/plain'
          ? formattedText
          : type === 'text/html'
            ? formattedHtml
            : data.getData(type),
      );
    }
    for (const file of Array.from(data.files)) copy.items.add(file);
  } catch {
    return undefined;
  }
  return copy;
}

/** What stands on either side of a range in a field. */
export function contextAround(
  field: HTMLElement,
  range: Range | undefined,
): PasteTypographyContext {
  if (!range || !field.contains(range.startContainer)) return {};
  return {
    before: wordsBeside(
      field,
      range.startContainer,
      range.startOffset,
      'before',
    ),
    after: field.contains(range.endContainer)
      ? wordsBeside(field, range.endContainer, range.endOffset, 'after')
      : '',
  };
}

/** Gives an event other data in place of what it carries. */
function carrying(
  event: Event,
  key: 'clipboardData' | 'dataTransfer',
  data: DataTransfer,
) {
  Object.defineProperty(event, key, { value: data, configurable: true });
}

export function bindEditorPasteTypography(holder: HTMLElement) {
  /** Pastes whose words were formatted here. */
  const formatted = new WeakSet<Event>();
  /** A drag that began in the editor moves the editor's own words. */
  let draggingOwn = false;

  const fieldOf = (target: EventTarget | null) =>
    textFieldOf(target instanceof Node ? target : null, holder);

  /**
   * Words copied or cut from a text of this editor: what the selection
   * reads now is what the browser is about to put on the clipboard.
   */
  function onCopy() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !fieldOf(selection.anchorNode)) return;
    rememberCopiedWords(selection.toString());
  }

  function onPaste(event: ClipboardEvent) {
    if (event.defaultPrevented || formatted.has(event)) return;
    const data = event.clipboardData;
    const field = fieldOf(event.target);
    if (!data || !field || bringsCopiedWords(data.getData('text/plain')))
      return;
    // The paste replaces the selection; `contextAround` reads it only when
    // it is in the field.
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    const copy = formattedTransfer(data, contextAround(field, range));
    if (!copy) return;
    carrying(event, 'clipboardData', copy);
    formatted.add(event);
  }

  /**
   * A formatted paste nothing took: the browser would put in the
   * clipboard's own words, so the formatted ones go in instead, as a
   * browser puts in a plain paste.
   */
  function onUnclaimedPaste(event: ClipboardEvent) {
    if (!formatted.has(event) || event.defaultPrevented) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    runEditCommand('insertText', text);
  }

  /**
   * A paste the browser announces without a paste event — a phone's
   * clipboard strip — is made one, with its words formatted, so it goes
   * the way every other paste goes.
   */
  function onBeforeInput(event: InputEvent) {
    if (
      event.inputType !== 'insertFromPaste' ||
      !event.cancelable ||
      editCommandRunning()
    )
      return;
    const field = fieldOf(event.target);
    if (!field) return;
    let data = event.dataTransfer;
    if (!data && event.data) {
      try {
        data = new DataTransfer();
        data.setData('text/plain', event.data);
      } catch {
        return;
      }
    }
    if (!data || bringsCopiedWords(data.getData('text/plain'))) return;
    const target = event.getTargetRanges()[0];
    const copy = formattedTransfer(
      data,
      contextAround(field, target && rangeOf(target)),
    );
    if (!copy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const paste = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    carrying(paste, 'clipboardData', copy);
    formatted.add(paste);
    (event.target as Node).dispatchEvent(paste);
  }

  function onDragStart() {
    draggingOwn = true;
  }

  function onDragEnd() {
    draggingOwn = false;
  }

  /** Words dropped from outside the editor, formatted where they land. */
  function onDrop(event: DragEvent) {
    const own = draggingOwn;
    draggingOwn = false;
    const data = event.dataTransfer;
    if (own || !data) return;
    if (data.types.includes(BLOCK_DRAG_MIME) || data.types.includes('Files'))
      return;
    const field = fieldOf(event.target);
    if (!field) return;
    const point = caretAtPoint(event.clientX, event.clientY, field);
    const copy = formattedTransfer(data, contextAround(field, point));
    if (copy) carrying(event, 'dataTransfer', copy);
  }

  // Capture, and bound before every other paste and drop of the editor, so
  // all of them read the formatted words; the last word is the document's.
  // A copy is heard before Editor.js's, and before the browser writes it.
  holder.addEventListener('copy', onCopy, true);
  holder.addEventListener('cut', onCopy, true);
  holder.addEventListener('paste', onPaste, true);
  holder.addEventListener('beforeinput', onBeforeInput, true);
  holder.addEventListener('dragstart', onDragStart, true);
  holder.addEventListener('dragend', onDragEnd, true);
  holder.addEventListener('drop', onDrop, true);
  holder.ownerDocument.addEventListener('paste', onUnclaimedPaste);
  return () => {
    holder.removeEventListener('copy', onCopy, true);
    holder.removeEventListener('cut', onCopy, true);
    holder.removeEventListener('paste', onPaste, true);
    holder.removeEventListener('beforeinput', onBeforeInput, true);
    holder.removeEventListener('dragstart', onDragStart, true);
    holder.removeEventListener('dragend', onDragEnd, true);
    holder.removeEventListener('drop', onDrop, true);
    holder.ownerDocument.removeEventListener('paste', onUnclaimedPaste);
  };
}
