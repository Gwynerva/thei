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

export function trimCurrentInlineSelection(): Range | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
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
  selection.removeAllRanges();
  selection.addRange(next);
  return next;
}

export interface InlineLinkRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  x: number;
  y: number;
}

export function translateInlineLinkRect(
  rect: InlineLinkRect,
  originalTrackerRect: Pick<InlineLinkRect, 'left' | 'top'>,
  currentTrackerRect: Pick<InlineLinkRect, 'left' | 'top'>,
): DOMRect {
  const left = currentTrackerRect.left + rect.left - originalTrackerRect.left;
  const top = currentTrackerRect.top + rect.top - originalTrackerRect.top;
  return DOMRect.fromRect({
    x: left,
    y: top,
    width: rect.width,
    height: rect.height,
  });
}

export function copyInlineLinkRect(rect: DOMRect): InlineLinkRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    x: rect.x,
    y: rect.y,
  };
}

export function inlineLinkPopupAnchorRect(
  rect: InlineLinkRect,
): InlineLinkRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left,
    bottom: rect.top,
    width: 0,
    height: 0,
    x: rect.left,
    y: rect.top,
  };
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
