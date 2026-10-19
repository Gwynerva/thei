import { normalizeContentInlineHtml } from '#layers/thei/shared/content-link';
import {
  editableFieldOf,
  insertHtmlAt,
  runEditCommand,
  selectRange,
} from '#layers/thei/app/components/content/editor-edit-commands';
import {
  caretAfterLetters,
  caretAtPoint,
  isMarkup,
  lettersBefore,
  markupAround,
  nodeAt,
  pathTo,
} from './editor-inline-dom';

/**
 * Text dragged in the editor lands where it is dropped, and Ctrl+Z takes the
 * drop back whole.
 *
 * Editor.js handles every drop on its holder itself: it cancels the
 * browser's move, deletes the dragged text with an editing command, puts the
 * caret at the end of the block and inserts the text there behind the undo
 * history's back. The piece lands at the end of the paragraph, and Ctrl+Z
 * brings it back to where it was while the copy at the end stays.
 *
 * So these listeners stand in front of Editor.js's — they are bound before
 * the editor is made, on the same holder — and keep every drop of text from
 * it:
 * - within one field, the field's words are written anew with the piece
 *   moved, as one editing command: one step, which Ctrl+Z undoes and redoes
 *   as one. The browser's own move would do the same, but it turns the
 *   piece's bold or link into styled spans, which the saved text drops;
 * - from one field to another, the text is deleted where it was and
 *   inserted where it is dropped by two editing commands: two steps, each
 *   undone in its turn. A field of plain text — a heading, a caption — gets
 *   the words alone;
 * - from outside the editor, the text is inserted at the drop point, cleaned
 *   to the markup a paragraph keeps, or as plain text into plain fields.
 *
 * Blocks dragged by their handle and files are left to their own handlers.
 * A link or a picture pressed outside a selection drags nothing: the browser
 * would drag its address or a copy of it.
 */

const BLOCK_DRAG_MIME = 'application/x-thei-editor-block';
/** The fields whose text keeps inline markup; any other field is plain. */
const RICH_FIELDS =
  '.ce-paragraph, .cdx-list__item-content, .cdx-quote__text, .cdx-quote__caption';
/** Markup with nothing to read, dropped whole with what it holds. */
const DROPPED_ELEMENTS =
  'script, style, noscript, template, iframe, object, embed, svg, math, img, video, audio, picture, canvas, head, meta, link, title';
/** Elements that begin a line of their own, read as a space between words. */
const BLOCK_ELEMENTS =
  'p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, section, article, header, footer, table, tr, td, th, dt, dd, figure, figcaption, hr';

export function bindEditorTextDrop(
  root: HTMLElement,
  options: { closeInlineToolbar?: () => void } = {},
) {
  /** The selection being dragged out of a field of this editor. */
  let source: { field: HTMLElement; range: Range } | undefined;

  function fieldIn(node: Node | null) {
    const field = editableFieldOf(node);
    return field && root.contains(field) ? field : undefined;
  }

  function isBlockDrag(event: DragEvent) {
    return Boolean(event.dataTransfer?.types.includes(BLOCK_DRAG_MIME));
  }

  function carriesFiles(event: DragEvent) {
    return Boolean(event.dataTransfer?.types.includes('Files'));
  }

  function onDragStart(event: DragEvent) {
    source = undefined;
    const target = event.target instanceof Node ? event.target : null;
    const field = fieldIn(target);
    if (!field) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    const pressed =
      target instanceof Element ? target.closest('a, img') : undefined;
    if (
      pressed &&
      (!range || range.collapsed || !range.intersectsNode(pressed))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!range || range.collapsed) return;
    source = { field, range: range.cloneRange() };
    // Editor.js would mark the drag as its own and delete the selection on
    // a later drop; it only gets to close its toolbar, which we do.
    event.stopImmediatePropagation();
    options.closeInlineToolbar?.();
  }

  function onDragOver(event: DragEvent) {
    if (isBlockDrag(event) || carriesFiles(event)) return;
    // Editor.js allows a drop anywhere and marks blocks as drop targets; an
    // editable field allows a drop of text by itself, anything else does not.
    event.stopImmediatePropagation();
  }

  function onDrop(event: DragEvent) {
    if (isBlockDrag(event) || carriesFiles(event)) {
      source = undefined;
      return;
    }
    event.stopImmediatePropagation();
    const dragged = source;
    source = undefined;
    const target = fieldIn(event.target instanceof Node ? event.target : null);
    const point = target && dropPoint(event, target);
    if (!target || !point) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const rich = isRichTextField(target);
    if (dragged?.field === target) {
      moveWithinField(target, dragged.range, point, rich);
      return;
    }
    let insertion: { html?: string; text: string };
    if (dragged) {
      const text = dragged.range.toString();
      // The piece keeps the bold, the link or the hint it was in, as a
      // move within one field does.
      insertion = {
        html: rich
          ? htmlOf(
              withInlineAncestors(
                dragged.range.cloneContents(),
                dragged.range.commonAncestorContainer,
                dragged.field,
                point.startContainer,
              ),
            )
          : undefined,
        text,
      };
      dragged.field.focus({ preventScroll: true });
      if (!selectRange(dragged.range) || !runEditCommand('delete'))
        dragged.range.deleteContents();
    } else {
      const html = event.dataTransfer?.getData('text/html') ?? '';
      const text = event.dataTransfer?.getData('text/plain') ?? '';
      insertion = { html: rich && html ? html : undefined, text };
    }
    insertAt(target, point, insertion);
  }

  function onDragEnd() {
    source = undefined;
  }

  root.addEventListener('dragstart', onDragStart, true);
  root.addEventListener('dragover', onDragOver, true);
  root.addEventListener('drop', onDrop, true);
  root.addEventListener('dragend', onDragEnd, true);
  return () => {
    root.removeEventListener('dragstart', onDragStart, true);
    root.removeEventListener('dragover', onDragOver, true);
    root.removeEventListener('drop', onDrop, true);
    root.removeEventListener('dragend', onDragEnd, true);
  };
}

/** Where in a field the pointer let go, as a collapsed range. */
function dropPoint(event: DragEvent, field: HTMLElement): Range | undefined {
  return caretAtPoint(event.clientX, event.clientY, field);
}

function insertAt(
  field: HTMLElement,
  point: Range,
  insertion: { html?: string; text: string },
) {
  field.focus({ preventScroll: true });
  const html =
    insertion.html === undefined
      ? undefined
      : cleanHtml(insertion.html, insertion.text);
  if (html !== undefined) {
    // Into the markup it lands in, which the browser would split round it.
    if (html && insertHtmlAt(point, html)) return;
  } else if (
    selectRange(point) &&
    insertion.text &&
    runEditCommand('insertText', plainText(insertion.text))
  ) {
    return;
  }
  // Refused: the same text by hand.
  const node = document.createTextNode(plainText(insertion.text));
  point.insertNode(node);
}

/**
 * Moves a piece of a field to a point in the same field as one editing
 * command: the move is made on a copy of the field, and the copy's words
 * replace the field's. The piece keeps the bold, the link or the hint it
 * was in. Dropped on itself, nothing changes.
 */
function moveWithinField(
  field: HTMLElement,
  source: Range,
  point: Range,
  rich: boolean,
) {
  const where = source.comparePoint(point.startContainer, point.startOffset);
  if (where === 0) return;
  const text = field.textContent ?? '';
  const sourceStart = lettersBefore(
    field,
    source.startContainer,
    source.startOffset,
  );
  const sourceEnd = lettersBefore(field, source.endContainer, source.endOffset);
  const pointAt = lettersBefore(field, point.startContainer, point.startOffset);
  const pieceLength = sourceEnd - sourceStart;
  // Where the piece ends once moved, to leave the caret there.
  const caretAt = where > 0 ? pointAt : pointAt + pieceLength;

  const whole = document.createRange();
  whole.selectNodeContents(field);
  field.focus({ preventScroll: true });
  if (rich) {
    const copy = field.cloneNode(true) as HTMLElement;
    const copied = (node: Node) => nodeAt(copy, pathTo(field, node)!)!;
    const piece = document.createRange();
    piece.setStart(copied(source.startContainer), source.startOffset);
    piece.setEnd(copied(source.endContainer), source.endOffset);
    const landing = document.createRange();
    landing.setStart(copied(point.startContainer), point.startOffset);
    landing.collapse(true);
    const carried = withInlineAncestors(
      piece.extractContents(),
      piece.commonAncestorContainer,
      copy,
      landing.startContainer,
    );
    landing.insertNode(carried);
    const html = normalizeContentInlineHtml(copy.innerHTML);
    // Refused: the same words by hand, which Ctrl+Z then does not cross.
    if (!selectRange(whole) || !runEditCommand('insertHTML', html))
      field.innerHTML = html;
  } else {
    const moved =
      where > 0
        ? text.slice(0, sourceStart) +
          text.slice(sourceEnd, pointAt) +
          text.slice(sourceStart, sourceEnd) +
          text.slice(pointAt)
        : text.slice(0, pointAt) +
          text.slice(sourceStart, sourceEnd) +
          text.slice(pointAt, sourceStart) +
          text.slice(sourceEnd);
    if (!selectRange(whole) || !runEditCommand('insertText', plainText(moved)))
      field.textContent = plainText(moved);
  }
  selectRange(
    caretAfterLetters(
      field,
      Math.min(caretAt, (field.textContent ?? '').length),
    ),
  );
}

/**
 * A piece taken from inside bold words, a link or a hint, wrapped again in
 * copies of them, so it carries them where it goes — but for markup the
 * place it lands in has already, and never a link into a link, which no
 * text can hold.
 */
function withInlineAncestors(
  fragment: DocumentFragment,
  from: Node,
  field: HTMLElement,
  landing: Node,
) {
  const there = markupAround(landing);
  const inLink = there.some((element) => element.matches('a'));
  let wrapped: Node = fragment;
  for (
    let at: Node | null = from instanceof Element ? from : from.parentNode;
    at && at !== field;
    at = at.parentNode
  ) {
    if (!isMarkup(at)) continue;
    const shell = at.cloneNode(false) as HTMLElement;
    if (inLink && shell.matches('a')) continue;
    if (there.some((element) => element.cloneNode(false).isEqualNode(shell)))
      continue;
    shell.append(wrapped);
    wrapped = shell;
  }
  return wrapped;
}

function htmlOf(node: Node) {
  const holder = document.createElement('div');
  holder.append(node);
  return holder.innerHTML;
}

/** Lines become spaces: one field holds one line of text. */
export function plainText(text: string) {
  return text.replace(/\s*[\r\n]+\s*/g, ' ');
}

/**
 * HTML cut down to what a paragraph keeps, read through a template so no
 * script or style ever runs or leaves its words behind. The spaces at its
 * edges stay: they separate it from the words it lands between.
 */
export function cleanHtml(html: string, text: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const content = template.content;
  for (const element of Array.from(content.querySelectorAll(DROPPED_ELEMENTS)))
    element.remove();
  for (const element of Array.from(content.querySelectorAll(BLOCK_ELEMENTS)))
    element.after(document.createTextNode(' '));
  const holder = document.createElement('div');
  holder.append(content);
  const inner = normalizeContentInlineHtml(holder.innerHTML);
  if (!inner) return '';
  const before = /^[ \t\u00a0]/.test(text) ? ' ' : '';
  const after = /[ \t\u00a0]$/.test(text) ? ' ' : '';
  return `${before}${inner}${after}`;
}

/**
 * How many separate paragraphs of text some HTML holds, the way a paste
 * would split it into blocks: a block-level element counts when it has words
 * and no such element inside it.
 */
export function htmlParagraphCount(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const content = template.content;
  for (const element of Array.from(content.querySelectorAll(DROPPED_ELEMENTS)))
    element.remove();
  let count = 0;
  for (const element of Array.from(content.querySelectorAll(BLOCK_ELEMENTS))) {
    if (element.querySelector(BLOCK_ELEMENTS)) continue;
    if (element.textContent?.trim()) count++;
  }
  // Words outside any block element make a paragraph of their own.
  const loose = Array.from(content.childNodes).some(
    (node) =>
      (node.nodeType === Node.TEXT_NODE ||
        (node instanceof Element && !node.matches(BLOCK_ELEMENTS))) &&
      node.textContent?.trim(),
  );
  return count + (loose ? 1 : 0);
}

/** Whether a field keeps inline markup, or takes words alone. */
export function isRichTextField(field: HTMLElement) {
  return field.matches(RICH_FIELDS);
}
