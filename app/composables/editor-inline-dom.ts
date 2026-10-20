import { CONTENT_INLINE_MARKUP_SELECTOR as INLINE_MARKUP } from '#layers/thei/shared/content-link';

/**
 * The markup of words in a text of the editor — a link, a hint, bold,
 * italic — as the editor's inline rules see it: where the caret stands
 * against it, which of it holds what, and the words on either side of a
 * place in it. Questions only; what changes the text is in
 * `editor-edit-commands.ts`.
 */

export type InlineSide = 'before' | 'after';
type InlineEdge = 'start' | 'end';

/** The editable field a node is in. */
export function editableFieldOf(node: Node | null | undefined) {
  if (!node) return undefined;
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>('[contenteditable="true"]') ?? undefined;
}

/** The caret in a text under `root`; with `collapsed`, only a caret. */
export function caretIn(
  root: HTMLElement,
  { collapsed = false } = {},
): Range | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount || (collapsed && !selection.isCollapsed))
    return undefined;
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) ? range : undefined;
}

/** A live range over what an input's target range names. */
export function rangeOf(target: StaticRange): Range {
  const range = document.createRange();
  range.setStart(target.startContainer, target.startOffset);
  range.setEnd(target.endContainer, target.endOffset);
  return range;
}

/** What an input puts in as text. */
export function typedText(event: InputEvent) {
  return event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
}

/**
 * Whether an input types words: a key, or a word a spelling suggestion puts
 * in place of the words its target range names.
 */
export function typesText(event: InputEvent) {
  return (
    event.inputType === 'insertText' ||
    event.inputType === 'insertReplacementText'
  );
}

let graphemes: Intl.Segmenter | undefined;

/** Whether text is one letter as a person sees it, accents and all. */
export function oneGrapheme(text: string) {
  if (!text) return false;
  graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const first = graphemes.segment(text)[Symbol.iterator]().next();
  return !first.done && first.value.segment.length === text.length;
}

export function isMarkup(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.matches(INLINE_MARKUP);
}

/**
 * A link never holds a link, and the browser's parser would close the outer
 * one at the inner one's start, cutting it in two. Words taken into a link —
 * a selection begun in another, a paste or a drop landing in one — keep their
 * words and lose the inner links' markup. `intoLink` says the words go into
 * a link already, so every link in them goes.
 */
export function unwrapNestedLinks(
  root: Element | DocumentFragment,
  intoLink = false,
) {
  for (const inner of Array.from(
    root.querySelectorAll<HTMLAnchorElement>(intoLink ? 'a' : 'a a'),
  ))
    inner.replaceWith(...Array.from(inner.childNodes));
}

/** The markup a node stands in within its text, innermost first. */
export function markupAround(node: Node): HTMLElement[] {
  const field = editableFieldOf(node);
  const found: HTMLElement[] = [];
  if (!field) return found;
  for (
    let element =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    element && element !== field && field.contains(element);
    element = element.parentElement
  )
    if (isMarkup(element)) found.push(element);
  return found;
}

/** The words of an element on one side of a place in it. */
export function wordsBeside(
  element: HTMLElement,
  node: Node,
  offset: number,
  side: InlineSide,
) {
  const range = document.createRange();
  if (side === 'before') {
    range.setStart(element, 0);
    range.setEnd(node, offset);
  } else {
    range.setStart(node, offset);
    range.setEnd(element, element.childNodes.length);
  }
  return range.toString();
}

/** The texts of an element, in order. */
export function textsOf(element: Node): Text[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    texts.push(node as Text);
  return texts;
}

/** The texts a range takes letters of, in order. */
function textsIn(range: Range): Text[] {
  const common = range.commonAncestorContainer;
  if (common.nodeType === Node.TEXT_NODE) return [common as Text];
  return textsOf(common).filter((text) => {
    if (!range.intersectsNode(text)) return false;
    const start = text === range.startContainer ? range.startOffset : 0;
    const end = text === range.endContainer ? range.endOffset : text.length;
    return end > start;
  });
}

/** A caret inside an element at its first or past its last letter. */
export function caretAtEdge(element: HTMLElement, edge: InlineEdge): Range {
  const texts = textsOf(element);
  const text = edge === 'end' ? texts.at(-1) : texts[0];
  const caret = document.createRange();
  if (text) caret.setStart(text, edge === 'end' ? text.length : 0);
  else caret.setStart(element, edge === 'end' ? element.childNodes.length : 0);
  caret.collapse(true);
  return caret;
}

/** The caret a point of the screen would be, inside `within`. */
export function caretAtPoint(
  x: number,
  y: number,
  within: HTMLElement,
): Range | undefined {
  let range: Range | undefined;
  if ('caretPositionFromPoint' in document) {
    const position = document.caretPositionFromPoint(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  } else
    range =
      (
        document as Document & {
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        }
      ).caretRangeFromPoint?.(x, y) ?? undefined;
  return range && within.contains(range.startContainer) ? range : undefined;
}

/** The number of a field's letters before a place in it. */
export function lettersBefore(field: HTMLElement, node: Node, offset: number) {
  return wordsBeside(field, node, offset, 'before').length;
}

/** A caret right after a number of an element's letters, in their node. */
export function caretAfterLetters(element: HTMLElement, count: number): Range {
  let left = count;
  for (const text of textsOf(element)) {
    if (left <= text.length) {
      const caret = document.createRange();
      caret.setStart(text, left);
      caret.collapse(true);
      return caret;
    }
    left -= text.length;
  }
  return caretAtEdge(element, 'end');
}

/** The places of the children from an ancestor down to a node in it. */
export function pathTo(ancestor: Node, node: Node): number[] | undefined {
  const path: number[] = [];
  for (let current = node; current !== ancestor;) {
    const parent = current.parentNode;
    if (!parent) return undefined;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return path;
}

/** The node at a path of children's places, if it is still there. */
export function nodeAt(ancestor: Node, path: readonly number[]) {
  return path.reduce<Node | undefined>(
    (node, index) => node?.childNodes[index],
    ancestor,
  );
}

/**
 * The innermost markup the caret stands inside of at its very edge: at its
 * last letter for `after`, its first for `before`.
 */
export function edgeInside(range: Range, side: InlineSide) {
  // Inside markup that goes on past the caret, no outer one ends here.
  const innermost = markupAround(range.startContainer)[0];
  return innermost &&
    wordsBeside(innermost, range.startContainer, range.startOffset, side) === ''
    ? innermost
    : undefined;
}

/** The markup right beside the caret, the caret outside it. */
export function edgeOutside(range: Range, side: InlineSide) {
  const { startContainer: node, startOffset: offset } = range;
  if (node.nodeType !== Node.TEXT_NODE) {
    const neighbour = node.childNodes[side === 'after' ? offset - 1 : offset];
    return isMarkup(neighbour) ? neighbour : undefined;
  }
  const atEdge =
    side === 'after' ? offset === 0 : offset === (node as Text).length;
  if (!atEdge) return undefined;
  const neighbour = side === 'after' ? node.previousSibling : node.nextSibling;
  return isMarkup(neighbour) ? neighbour : undefined;
}

/**
 * The place one letter from the edge of a text where markup begins or ends,
 * on the side given: the browser would carry the caret over the edge to the
 * other side of it, past this place. None when the caret is not there.
 */
export function oneLetterFromEdge(
  range: Range,
  side: InlineSide,
): Range | undefined {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return undefined;
  const text = node as Text;
  const step =
    side === 'before'
      ? text.data.slice(0, range.startOffset)
      : text.data.slice(range.startOffset);
  if (!oneGrapheme(step)) return undefined;
  const sibling = side === 'before' ? text.previousSibling : text.nextSibling;
  if (sibling ? !isMarkup(sibling) : !isMarkup(text.parentElement))
    return undefined;
  const caret = document.createRange();
  caret.setStart(text, side === 'before' ? 0 : text.length);
  caret.collapse(true);
  return caret;
}

/**
 * Markup the caret stands right beside, outside it, where the browser would
 * type into it all the same: after it — a hint or bold takes even the first
 * letter of the words that follow — or before it from a place between two
 * nodes rather than inside words. A caret at the end of the words before
 * markup is left alone: the browser types there, outside, by itself.
 */
export function besideMarkup(
  range: Range,
): { element: HTMLElement; side: InlineSide } | undefined {
  const after = edgeOutside(range, 'after');
  if (after) return { element: after, side: 'after' };
  if (range.startContainer.nodeType === Node.TEXT_NODE) return undefined;
  const before = edgeOutside(range, 'before');
  return before ? { element: before, side: 'before' } : undefined;
}

/**
 * The markup the caret stands in at an edge where the browser would write
 * what is typed outside it, whatever the ring round it says: at its first
 * letter it writes before any markup, and it keeps clear of a link's last
 * letter too. The outermost such element, to be put back whole.
 */
export function insideEdgeAt(at: Range): HTMLElement | undefined {
  if (!at.collapsed) return undefined;
  const { startContainer: node, startOffset: offset } = at;
  let found: HTMLElement | undefined;
  for (const element of markupAround(node))
    if (
      wordsBeside(element, node, offset, 'before') === '' ||
      (element.matches('a') &&
        wordsBeside(element, node, offset, 'after') === '')
    )
      found = element;
  return found;
}

/**
 * The markup that holds a range's words and nothing more, outermost first:
 * what would be left empty once they go. None when the words are only part
 * of an element's, or stretch past it.
 */
export function markupHeldBy(range: Range): HTMLElement[] {
  const words = range.toString();
  const texts = textsIn(range);
  const first = texts[0];
  const last = texts.at(-1);
  if (!words || !first || !last) return [];
  const chain: HTMLElement[] = [];
  for (const element of markupAround(first)) {
    if (!element.contains(last) || element.textContent !== words) break;
    chain.unshift(element);
  }
  return chain;
}

/** A box of the page as a place in `root`, which must be positioned. */
export function placeInRoot(root: HTMLElement, rect: DOMRectReadOnly) {
  const origin = root.getBoundingClientRect();
  return {
    left: rect.left - origin.left - root.clientLeft,
    top: rect.top - origin.top - root.clientTop,
  };
}
