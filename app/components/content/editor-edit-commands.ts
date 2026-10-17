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

/** Runs one editing command; false when the browser did not run it. */
export function runEditCommand(command: string, value?: string) {
  try {
    return (
      typeof document.execCommand === 'function' &&
      document.execCommand(command, false, value)
    );
  } catch {
    return false;
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

/** The editable field a node is in. */
export function editableFieldOf(node: Node | null | undefined) {
  if (!node) return undefined;
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>('[contenteditable="true"]') ?? undefined;
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
  if (field) field.focus({ preventScroll: true });
  if (!selectRange(range) || !runEditCommand('insertHTML', html))
    return undefined;
  const inserted = (field ?? document).querySelector<HTMLElement>(
    `[${MARK}="${mark}"]`,
  );
  inserted?.removeAttribute(MARK);
  return inserted;
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
 * Writes text right outside an inline element — after it, or before it —
 * as one undoable step: the element is put back with the text beside it.
 * A browser asked to type there types into the element instead, which is
 * how its markup would never be left. The caret ends after the text.
 */
export function writeBesideElement(
  element: HTMLElement,
  text: string,
  side: 'before' | 'after',
  /** What goes back in the element's place, when not the element as it is. */
  replacement: HTMLElement = element,
): boolean {
  const marked = markedHtml(replacement);
  const html =
    side === 'after'
      ? marked.html + textAsHtml(text)
      : textAsHtml(text) + marked.html;
  const range = document.createRange();
  range.selectNode(element);
  const inserted = insertMarkedHtml(range, html, marked.mark);
  if (inserted !== undefined) {
    const written =
      side === 'after' ? inserted?.nextSibling : inserted?.previousSibling;
    if (written?.nodeType === Node.TEXT_NODE) {
      // The text may have joined the words already beside the element:
      // after it, the text starts that node; before it, it ends it.
      const length = (written as Text).data.length;
      const caret = document.createRange();
      caret.setStart(
        written,
        side === 'after' ? Math.min(text.length, length) : length,
      );
      caret.collapse(true);
      selectRange(caret);
    }
    return true;
  }
  // Refused: the same change by hand, outside the browser's history.
  if (replacement !== element) element.replaceWith(replacement);
  const node = document.createTextNode(text);
  if (side === 'after') replacement.after(node);
  else replacement.before(node);
  const caret = document.createRange();
  caret.setStart(node, text.length);
  caret.collapse(true);
  selectRange(caret);
  return false;
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

/** Takes a link off its words, as one undoable step. */
export function unlinkElement(link: HTMLAnchorElement) {
  const field = editableFieldOf(link);
  if (field) field.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(link);
  if (selectRange(range) && runEditCommand('unlink') && !link.isConnected) {
    return true;
  }
  if (link.isConnected) link.replaceWith(...Array.from(link.childNodes));
  return false;
}

/** Puts the caret right after a node. */
export function placeCaretAfter(node: Node) {
  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  selectRange(after);
}
