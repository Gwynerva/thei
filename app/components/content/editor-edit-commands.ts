/**
 * Changes to the editor's text made the way the browser makes its own: as
 * editing commands, which the browser's undo history records.
 *
 * Ctrl+Z in the editor is the browser's. It keeps a list of the edits it
 * made and replays them backwards, by node and offset. An edit made behind
 * its back — a node inserted, text rewritten through the DOM — is not on
 * that list, and the edits around it then undo into the wrong place: a
 * dragged piece comes back while its copy stays, a dash undoes into a
 * neighbouring word. So whatever Thei writes into a field of text goes
 * through here, and a browser that refuses a command gets the plain DOM
 * change instead, which the undo guard (`editor-native-undo.ts`) then
 * keeps Ctrl+Z from crossing.
 */
import {
  caretAfterLetters,
  editableFieldOf,
  lettersBefore,
  markupAround,
  nodeAt,
  pathTo,
  unwrapNestedLinks,
  wordsBeside,
} from '../../composables/editor-inline-dom';

export { editableFieldOf };

let commandsRunning = 0;

/**
 * Told on a field once Thei has written what was typed and set the caret
 * after it — the letters a rule took in place of the browser — so whatever
 * follows typing, smart typography, follows these too.
 */
export const TYPED_BY_COMMAND = 'thei:typed';

export function announceTyped() {
  editableFieldOf(window.getSelection()?.anchorNode)?.dispatchEvent(
    new Event(TYPED_BY_COMMAND, { bubbles: true }),
  );
}

/**
 * Whether one of these commands is running: the `input` it fires is its own
 * step, never the typing a key announced and that was stopped for it.
 */
export function editCommandRunning() {
  return commandsRunning > 0;
}

/** Runs one editing command; false when the browser did not run it. */
export function runEditCommand(command: string, value?: string) {
  commandsRunning++;
  try {
    return (
      typeof document.execCommand === 'function' &&
      document.execCommand(command, false, value)
    );
  } catch {
    return false;
  } finally {
    commandsRunning--;
  }
}

/** Makes a range the selection, where editing commands act. */
export function selectRange(range: Range) {
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

const MARK = 'data-thei-inserting';
let marks = 0;

/** An element as HTML with a one-time mark, to find it by once it is in. */
function markedHtml(element: HTMLElement) {
  const mark = `m${++marks}`;
  element.setAttribute(MARK, mark);
  const html = element.outerHTML;
  element.removeAttribute(MARK);
  return { mark, html };
}

/**
 * The browser splits bold, italic and strike round HTML it puts in, and puts
 * it outside them, and outside a link at the link's edge: words written into
 * markup would leave it. So markup round the range goes back whole, a copy
 * of it with the HTML in place: the same change, made where nothing splits.
 * The copy is marked, and how many of its letters come before the caret's
 * new place counted, to put the caret back after what went in.
 */
function wholeAround(range: Range, html: string) {
  const outer = markupAround(range.commonAncestorContainer).at(-1);
  const start = outer && pathTo(outer, range.startContainer);
  const end = outer && pathTo(outer, range.endContainer);
  if (!outer || !start || !end) return { range, html };
  const copy = outer.cloneNode(true) as HTMLElement;
  const inside = document.createRange();
  inside.setStart(nodeAt(copy, start)!, range.startOffset);
  inside.setEnd(nodeAt(copy, end)!, range.endOffset);
  inside.deleteContents();
  const parsed = document.createElement('template');
  parsed.innerHTML = html;
  const letters =
    wordsBeside(outer, range.startContainer, range.startOffset, 'before')
      .length + (parsed.content.textContent ?? '').length;
  inside.insertNode(parsed.content);
  unwrapNestedLinks(copy);
  const whole = document.createRange();
  whole.selectNode(outer);
  const marked = markedHtml(copy);
  return { range: whole, html: marked.html, outer: marked.mark, letters };
}

/**
 * Puts HTML in place of a range by one editing command, the caret after
 * it, as typing leaves the caret; false when the browser refused.
 */
export function insertHtmlAt(range: Range, html: string) {
  const field = editableFieldOf(range.commonAncestorContainer);
  if (field) field.focus({ preventScroll: true });
  const whole = wholeAround(range, html);
  if (!selectRange(whole.range) || !runEditCommand('insertHTML', whole.html))
    return false;
  if (whole.outer) {
    const placed = (field ?? document).querySelector<HTMLElement>(
      `[${MARK}="${whole.outer}"]`,
    );
    placed?.removeAttribute(MARK);
    if (placed) selectRange(caretAfterLetters(placed, whole.letters));
  }
  return true;
}

/**
 * Puts HTML in place of a range by one editing command, then finds the
 * element marked in it. `undefined` when the browser refused the command;
 * `null` when it merged the element away, which is then not to be put in
 * a second time.
 */
function insertMarkedHtml(
  range: Range,
  html: string,
  mark: string,
): HTMLElement | null | undefined {
  const field = editableFieldOf(range.commonAncestorContainer);
  if (!insertHtmlAt(range, html)) return undefined;
  const inserted = (field ?? document).querySelector<HTMLElement>(
    `[${MARK}="${mark}"]`,
  );
  inserted?.removeAttribute(MARK);
  return inserted;
}

/**
 * Takes markup off its words, as one undoable step: the words stay where
 * they were. The caret ends after them.
 */
export function unwrapElement(element: HTMLElement) {
  const range = document.createRange();
  range.selectNode(element);
  if (insertHtmlAt(range, element.innerHTML)) return true;
  // Refused: the same change by hand, outside the browser's history.
  const last = element.lastChild;
  element.replaceWith(...Array.from(element.childNodes));
  if (last) placeCaretAfter(last);
  return false;
}

/**
 * Replaces a range with an element, as one undoable step: the element goes
 * in as HTML with a one-time mark, and is found by the mark afterwards. The
 * caret ends right after it. Returns the element now in the text.
 */
export function insertInlineElement(
  range: Range,
  element: HTMLElement,
): HTMLElement | undefined {
  unwrapNestedLinks(element);
  const { mark, html } = markedHtml(element);
  const inserted = insertMarkedHtml(range, html, mark);
  if (inserted !== undefined) {
    if (inserted) placeCaretAfter(inserted);
    return inserted ?? undefined;
  }
  // Refused: the same change by hand, outside the browser's history.
  range.deleteContents();
  range.insertNode(element);
  placeCaretAfter(element);
  return element;
}

/**
 * Marks a range with an element — a link, a hint — as one undoable step:
 * the element it lies in already, put back as `prepare` changes a copy of
 * it, or a new one round its words. Returns the element now in the text.
 */
export function writeMarkup<T extends HTMLElement>(
  range: Range,
  existing: T | undefined,
  create: () => T,
  prepare: (element: T) => void,
): T | undefined {
  if (!existing) {
    const element = create();
    element.append(range.cloneContents());
    prepare(element);
    return insertInlineElement(range, element) as T | undefined;
  }
  const copy = existing.cloneNode(true) as T;
  prepare(copy);
  const whole = document.createRange();
  whole.selectNode(existing);
  return insertInlineElement(whole, copy) as T | undefined;
}

/**
 * Text as HTML to put in by a command. A space at its edge goes in as a
 * no-break space, as the browser types one there: a plain one at the edge
 * of what is put in would be collapsed away. The text's own normalization
 * reads both as one space.
 */
function textAsHtml(text: string) {
  return text
    .replace(
      /[&<>]/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!,
    )
    .replace(/^ | $/g, '&nbsp;');
}

/**
 * Writes words right outside an inline element — after it, or before it —
 * as one undoable step: the element is put back with them beside it. A
 * browser asked to type there types into the element instead, which is how
 * its markup would never be left. Text, or HTML as `{ html }`. The caret
 * ends after the words, in their text, where the browser types on itself.
 */
export function writeBesideElement(
  element: HTMLElement,
  words: string | { html: string },
  side: 'before' | 'after',
  /** What goes back in the element's place, when not the element as it is. */
  replacement: HTMLElement = element,
): boolean {
  const piece = typeof words === 'string' ? textAsHtml(words) : words.html;
  const parsed = document.createElement('template');
  parsed.innerHTML = piece;
  const letters = (parsed.content.textContent ?? '').length;
  const marked = markedHtml(replacement);
  const range = document.createRange();
  range.selectNode(element);
  const inserted = insertMarkedHtml(
    range,
    side === 'after' ? marked.html + piece : piece + marked.html,
    marked.mark,
  );
  if (inserted === undefined) {
    // Refused: the same change by hand, outside the browser's history.
    if (replacement !== element) element.replaceWith(replacement);
    const placed = parsed.content;
    const last = placed.lastChild;
    if (side === 'after') replacement.after(placed);
    else replacement.before(placed);
    if (last) placeCaretAfter(last);
    return false;
  }
  if (!inserted) return true;
  if (side === 'before') {
    // Right before the element, at the end of the words before it.
    const before = inserted.previousSibling;
    const caret = document.createRange();
    if (before?.nodeType === Node.TEXT_NODE)
      caret.setStart(before, (before as Text).length);
    else caret.setStartBefore(inserted);
    caret.collapse(true);
    selectRange(caret);
    return true;
  }
  // The words may have joined those already after the element.
  let left = letters;
  for (let node = inserted.nextSibling; node; node = node.nextSibling) {
    const length = node.textContent?.length ?? 0;
    if (left <= length) {
      if (node.nodeType === Node.TEXT_NODE) {
        const caret = document.createRange();
        caret.setStart(node, left);
        caret.collapse(true);
        selectRange(caret);
      } else selectRange(caretAfterLetters(node as HTMLElement, left));
      return true;
    }
    left -= length;
  }
  return true;
}

/** Replaces a range with plain text, as one undoable step. */
export function replaceRangeText(range: Range, text: string) {
  const field = editableFieldOf(range.commonAncestorContainer);
  if (field && document.activeElement !== field)
    field.focus({ preventScroll: true });
  if (selectRange(range) && runEditCommand('insertText', text)) return true;
  range.deleteContents();
  if (text) {
    const node = document.createTextNode(text);
    range.insertNode(node);
    placeCaretAfter(node);
  }
  return false;
}

/**
 * A field of plain words made plain again when markup got in — a paste, the
 * browser's own formatting — as one undoable step, the selection kept at the
 * same letters. Returns the words.
 */
export function flattenToPlainText(field: HTMLElement) {
  const selection = window.getSelection();
  const inside = Boolean(
    selection?.anchorNode &&
    selection.focusNode &&
    field.contains(selection.anchorNode) &&
    field.contains(selection.focusNode),
  );
  const anchor = inside
    ? lettersBefore(field, selection!.anchorNode!, selection!.anchorOffset)
    : 0;
  const focus = inside
    ? lettersBefore(field, selection!.focusNode!, selection!.focusOffset)
    : 0;
  const text = field.textContent ?? '';
  const whole = document.createRange();
  whole.selectNodeContents(field);
  replaceRangeText(whole, text);
  if (!inside || !selection) return text;
  const from = caretAfterLetters(field, Math.min(anchor, text.length));
  const to = caretAfterLetters(field, Math.min(focus, text.length));
  selection.setBaseAndExtent(
    from.startContainer,
    from.startOffset,
    to.startContainer,
    to.startOffset,
  );
  return text;
}

/** Takes a link off its words, as one undoable step. */
export function unlinkElement(link: HTMLAnchorElement) {
  const field = editableFieldOf(link);
  if (field) field.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(link);
  if (selectRange(range) && runEditCommand('unlink') && !link.isConnected) {
    return true;
  }
  return link.isConnected ? unwrapElement(link) : false;
}

/** Puts the caret right after a node. */
export function placeCaretAfter(node: Node) {
  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  selectRange(after);
}
