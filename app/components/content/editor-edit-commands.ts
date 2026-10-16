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

/**
 * Replaces a range with an element, as one undoable step: the element goes
 * in as HTML with a one-time mark, and is found by the mark afterwards. The
 * caret ends right after it. Returns the element now in the text.
 */
export function insertInlineElement(
  range: Range,
  element: HTMLElement,
): HTMLElement | undefined {
  const field = editableFieldOf(range.commonAncestorContainer);
  const mark = `m${++marks}`;
  element.setAttribute(MARK, mark);
  const html = element.outerHTML;
  element.removeAttribute(MARK);
  if (field) field.focus({ preventScroll: true });
  if (selectRange(range) && runEditCommand('insertHTML', html)) {
    // Run, it is in: found by its mark, or — merged away by the browser —
    // not to be put in a second time.
    const inserted = (field ?? document).querySelector<HTMLElement>(
      `[${MARK}="${mark}"]`,
    );
    inserted?.removeAttribute(MARK);
    if (inserted) placeCaretAfter(inserted);
    return inserted ?? undefined;
  }
  // Refused: the same change by hand, outside the browser's history.
  range.deleteContents();
  range.insertNode(element);
  placeCaretAfter(element);
  return element;
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
