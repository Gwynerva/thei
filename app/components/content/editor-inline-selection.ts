const INLINE_HORIZONTAL_SPACE =
  /[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/;

export function trimInlineSelectionOffsets(
  text: string,
  start = 0,
  end = text.length,
): { start: number; end: number } | undefined {
  let nextStart = Math.max(0, Math.min(start, text.length));
  let nextEnd = Math.max(nextStart, Math.min(end, text.length));
  while (nextStart < nextEnd && INLINE_HORIZONTAL_SPACE.test(text[nextStart]!))
    nextStart++;
  while (
    nextEnd > nextStart &&
    INLINE_HORIZONTAL_SPACE.test(text[nextEnd - 1]!)
  )
    nextEnd--;
  return nextStart === nextEnd ? undefined : { start: nextStart, end: nextEnd };
}

/**
 * The same range without the spaces at its edges: a double click, or a drag
 * to the end of a word, picks up the space beside it, and a link or a hint
 * should not. `undefined` when there is nothing but spaces. A range that does
 * not lie within one editable field is returned as it is.
 */
export function trimInlineRange(range: Range): Range | undefined {
  if (range.collapsed) return range;
  const root = editableRoot(range.startContainer);
  if (!root || !root.contains(range.endContainer)) return range;

  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  const offsets = trimInlineSelectionOffsets(
    root.textContent ?? '',
    start,
    start + range.toString().length,
  );
  if (!offsets) return;

  const next = document.createRange();
  const startPoint = textPoint(root, offsets.start);
  const endPoint = textPoint(root, offsets.end);
  next.setStart(startPoint.node, startPoint.offset);
  next.setEnd(endPoint.node, endPoint.offset);
  return next;
}

/** Trims the current selection in place (see `trimInlineRange`). */
export function trimCurrentInlineSelection(): Range | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const next = trimInlineRange(range);
  if (!next || next === range) return next;
  selection.removeAllRanges();
  selection.addRange(next);
  return next;
}

function editableRoot(node: Node): HTMLElement | undefined {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>('[contenteditable="true"]') ?? undefined;
}

function textPoint(root: Node, target: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let last: Text | undefined;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    last = node;
    if (remaining <= node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  return last
    ? { node: last, offset: last.data.length }
    : { node: root, offset: root.childNodes.length };
}
