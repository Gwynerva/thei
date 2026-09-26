/**
 * Puts the caret where a click beside a block's text points at.
 *
 * Editor.js only handles clicks below the last block. A click next to a
 * paragraph — in the margin on a desktop, in the modal's padding on a phone —
 * lands on the block wrapper and places no caret at all, so the start of a
 * line could not be reached with the mouse. This reads the click as the
 * nearest position inside the block's text instead: the start of that very
 * line from the left, its end from the right.
 *
 * The caret is placed on `click`, not on `mousedown`: Editor.js starts its
 * rectangle selection on a mousedown in the margin and drops every range on
 * the first mousemove, so a caret placed earlier would not survive a shaky
 * hand. A press that travels further than a tap is left to that selection.
 */

import type EditorJS from '@editorjs/editorjs';

/** Anything a click is for on its own, or that the editor handles itself. */
const SKIP_SELECTOR = [
  '[contenteditable]',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  '[data-mutation-free]',
  '.ce-toolbar',
  '.ce-inline-toolbar',
  '.ce-popover',
  '.content-private-bracket',
].join(', ');
const BLOCK_SELECTOR = '.ce-block';
const EDITOR_SELECTOR = '.codex-editor';
const SELECTED_BLOCK_SELECTOR = '.ce-block--selected';
const INPUT_SELECTOR = '[contenteditable="true"]';
/** How far a press may travel and still count as a click, in pixels. */
const CLICK_TRAVEL = 3;

export interface GutterRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface GutterPoint {
  x: number;
  y: number;
}

/**
 * Which of a block's fields a click beside it belongs to, and the point
 * inside that field the caret is read at.
 *
 * The field whose lines the click is level with; failing that, the nearest
 * one. The point is the click pulled just inside the field's box, so a click
 * in the left margin reads as the start of its line and one in the right
 * margin as the end.
 */
export function gutterCaretTarget(
  rects: readonly GutterRect[],
  point: GutterPoint,
): { index: number; x: number; y: number } | undefined {
  if (!rects.length) return undefined;
  let index = rects.findIndex(
    (rect) => point.y >= rect.top && point.y <= rect.bottom,
  );
  if (index < 0) {
    let nearest = Number.POSITIVE_INFINITY;
    rects.forEach((rect, candidate) => {
      const distance =
        point.y < rect.top ? rect.top - point.y : point.y - rect.bottom;
      if (distance < nearest) {
        nearest = distance;
        index = candidate;
      }
    });
  }
  const rect = rects[index]!;
  return {
    index,
    x: clamp(point.x, rect.left + 1, rect.right - 1),
    y: clamp(point.y, rect.top + 1, rect.bottom - 1),
  };
}

/** Which end of a field a click belongs to when no text is under it. */
export function fallbackCaretEdge(
  x: number,
  rect: GutterRect,
): 'start' | 'end' {
  return x < (rect.left + rect.right) / 2 ? 'start' : 'end';
}

export function bindEditorGutterClick(root: HTMLElement, editor: EditorJS) {
  let pressed: GutterPoint | undefined;

  /**
   * The block a click beside a block belongs to: the one under the pointer,
   * or — for a click in the editor's own padding, which lies outside every
   * block — the one level with the pointer.
   */
  function blockFor(target: Element, y: number) {
    const block = target.closest<HTMLElement>(BLOCK_SELECTOR);
    if (block) return root.contains(block) ? block : undefined;
    if (target !== root && !target.closest(EDITOR_SELECTOR)) return;
    for (const candidate of root.querySelectorAll<HTMLElement>(
      BLOCK_SELECTOR,
    )) {
      const rect = candidate.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return candidate;
    }
  }

  function fieldsFor(target: EventTarget | null, y: number) {
    if (!(target instanceof Element) || target.closest(SKIP_SELECTOR)) return;
    const block = blockFor(target, y);
    if (!block) return;
    // A selected block is being acted on as a whole, as Editor.js does below
    // the last block too.
    if (root.querySelector(SELECTED_BLOCK_SELECTOR)) return;
    // The fields of a block the editor lays out itself; the ones inside a
    // Vue tree of a block tool are that tool's own business.
    const inputs = Array.from(
      block.querySelectorAll<HTMLElement>(INPUT_SELECTOR),
    ).filter(
      (input) =>
        !input.closest('[data-mutation-free]') &&
        input.getClientRects().length > 0,
    );
    return inputs.length ? { block, inputs } : undefined;
  }

  function onMouseDown(event: MouseEvent) {
    pressed = undefined;
    if (event.button !== 0 || !fieldsFor(event.target, event.clientY)) return;
    pressed = { x: event.clientX, y: event.clientY };
    // Focus and the current selection stay where they are until `click`
    // decides; the event still bubbles, so Editor.js sees it as before.
    event.preventDefault();
  }

  function onClick(event: MouseEvent) {
    const start = pressed;
    pressed = undefined;
    if (!start) return;
    if (
      Math.abs(event.clientX - start.x) > CLICK_TRAVEL ||
      Math.abs(event.clientY - start.y) > CLICK_TRAVEL
    )
      return;
    const hit = fieldsFor(event.target, event.clientY);
    if (!hit) return;
    const { block, inputs } = hit;

    const rects = inputs.map((input) => input.getBoundingClientRect());
    const target = gutterCaretTarget(rects, {
      x: event.clientX,
      y: event.clientY,
    });
    if (!target) return;
    const input = inputs[target.index]!;
    const position =
      caretPositionAt(target.x, target.y, input) ??
      edgePosition(
        input,
        fallbackCaretEdge(event.clientX, rects[target.index]!),
      );
    const selection = window.getSelection();
    if (!selection) return;

    if (
      event.shiftKey &&
      selection.anchorNode &&
      input.contains(selection.anchorNode)
    ) {
      selection.extend(position.node, position.offset);
      return;
    }
    // The block becomes the editor's current one the way a caret set through
    // its API does, so the toolbar and the inline tools follow. Then the
    // precise position: focus first, with no range anywhere, because Editor.js
    // takes its current field from the focused element when the selection
    // does not name one yet.
    const blockApi = editor.blocks.getBlockByElement(block);
    if (blockApi) editor.caret.setToBlock(blockApi, 'start');
    selection.removeAllRanges();
    input.focus({ preventScroll: true });
    selection.collapse(position.node, position.offset);
    // A tap in the padding never crossed a block, so the editor has not
    // opened the toolbar for it yet.
    editor.toolbar.open();
  }

  root.addEventListener('mousedown', onMouseDown);
  root.addEventListener('click', onClick);

  return () => {
    root.removeEventListener('mousedown', onMouseDown);
    root.removeEventListener('click', onClick);
  };
}

interface CaretPosition {
  node: Node;
  offset: number;
}

function caretPositionAt(
  x: number,
  y: number,
  input: HTMLElement,
): CaretPosition | undefined {
  if ('caretPositionFromPoint' in document) {
    const position = document.caretPositionFromPoint(x, y);
    return position && input.contains(position.offsetNode)
      ? { node: position.offsetNode, offset: position.offset }
      : undefined;
  }
  const range = (
    document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }
  ).caretRangeFromPoint?.(x, y);
  return range && input.contains(range.startContainer)
    ? { node: range.startContainer, offset: range.startOffset }
    : undefined;
}

function edgePosition(
  input: HTMLElement,
  edge: 'start' | 'end',
): CaretPosition {
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let node: Node | null = null;
  if (edge === 'start') {
    node = walker.nextNode();
  } else {
    while (walker.nextNode()) node = walker.currentNode;
  }
  if (!node) {
    return {
      node: input,
      offset: edge === 'start' ? 0 : input.childNodes.length,
    };
  }
  return {
    node,
    offset: edge === 'start' ? 0 : (node.textContent?.length ?? 0),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
