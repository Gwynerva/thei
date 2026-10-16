import { CONTENT_INLINE_MARKUP_SELECTOR as INLINE_MARKUP } from '#layers/thei/shared/content-link';
import {
  editableFieldOf,
  selectRange,
  writeBesideElement,
} from '../components/content/editor-edit-commands';

export type InlineSide = 'before' | 'after';
type Side = InlineSide;

/** A tap or a click this recent placed the caret, and may have meant beside. */
const POINTER_WINDOW = 400;

function collapsedCaret(root: HTMLElement): Range | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) ? range : undefined;
}

/**
 * The innermost markup the caret stands inside of at its very edge: at its
 * last letter for `after`, its first for `before`.
 */
export function edgeInside(range: Range, side: Side): HTMLElement | undefined {
  const field = editableFieldOf(range.startContainer);
  let element =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as Element);
  for (
    ;
    element && element !== field && field?.contains(element);
    element = element.parentElement
  ) {
    if (!element.matches(INLINE_MARKUP)) continue;
    const rest = document.createRange();
    if (side === 'after') {
      rest.setStart(range.startContainer, range.startOffset);
      rest.setEnd(element, element.childNodes.length);
    } else {
      rest.setStart(element, 0);
      rest.setEnd(range.startContainer, range.startOffset);
    }
    // Inside markup that goes on past the caret, no outer one ends here.
    return rest.toString() === '' ? (element as HTMLElement) : undefined;
  }
  return undefined;
}

/** The markup right beside the caret, the caret outside it. */
export function edgeOutside(range: Range, side: Side): HTMLElement | undefined {
  const { startContainer: node, startOffset: offset } = range;
  let neighbour: Node | null | undefined;
  if (node.nodeType === Node.TEXT_NODE) {
    const atEdge =
      side === 'after' ? offset === 0 : offset === (node as Text).data.length;
    if (!atEdge) return undefined;
    neighbour = side === 'after' ? node.previousSibling : node.nextSibling;
  } else neighbour = node.childNodes[side === 'after' ? offset - 1 : offset];
  return neighbour instanceof HTMLElement && neighbour.matches(INLINE_MARKUP)
    ? neighbour
    : undefined;
}

/**
 * Stepping out of the markup of words — a link, a hint, bold, italic — at
 * its edge. At the last letter of one, → puts the caret right after it; at
 * its first, ← right before it: the first press steps out, the next moves
 * on. A tap or a click past its edge does the same, which is the only way
 * there is on a phone.
 *
 * The browser itself types into the markup there, after a hint or bold even
 * from the start of the words that follow. So the first letter typed outside
 * is written by an editing command that puts the element back with the
 * letter beside it: one step of Ctrl+Z, nothing invisible left in the text,
 * and what is typed next follows that letter. A phone's keyboard composes
 * words, which cannot be stopped from going in; a word composed into the
 * markup from outside is moved out the same way once it is done.
 */
export function bindEditorInlineBoundary(root: HTMLElement) {
  let outside: { element: HTMLElement; side: Side } | undefined;
  /** A word being composed beside markup, and the markup's words before it. */
  let composing:
    { element: HTMLElement; side: Side; words: string } | undefined;
  let pointer: { x: number; y: number; at: number } | undefined;
  /** The selection change the next step out makes, not the writer's. */
  let placing = false;

  function standsOutside(range: Range, state: NonNullable<typeof outside>) {
    return (
      state.element.isConnected &&
      edgeOutside(range, state.side) === state.element
    );
  }

  function stepOut(element: HTMLElement, side: Side) {
    const caret = document.createRange();
    if (side === 'after') caret.setStartAfter(element);
    else caret.setStartBefore(element);
    caret.collapse(true);
    placing = true;
    // A caret already there makes no change to report.
    requestAnimationFrame(() => (placing = false));
    selectRange(caret);
    outside = { element, side };
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
      return;
    if (event.isComposing) return;
    const range = collapsedCaret(root);
    if (!range) return;
    const side: Side = event.key === 'ArrowRight' ? 'after' : 'before';
    const element = edgeInside(range, side);
    if (!element) return;
    event.preventDefault();
    // Editor.js would take the key on to the next block.
    event.stopPropagation();
    stepOut(element, side);
  }

  function onBeforeInput(event: InputEvent) {
    const state = outside;
    if (!state) return;
    if (event.inputType === 'insertCompositionText') return;
    outside = undefined;
    // What cannot be stopped is left to the browser.
    if (event.defaultPrevented || !event.cancelable) return;
    if (
      event.inputType !== 'insertText' &&
      event.inputType !== 'insertReplacementText'
    )
      return;
    const range = collapsedCaret(root);
    if (!range || !standsOutside(range, state)) return;
    // A spelling suggestion aims at a word, not at the caret: the browser's.
    if (
      event.inputType === 'insertReplacementText' &&
      !event.getTargetRanges()[0]?.collapsed
    )
      return;
    const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
    if (!text) return;
    event.preventDefault();
    writeBesideElement(state.element, text, state.side);
  }

  function onCompositionStart() {
    const range = collapsedCaret(root);
    composing =
      outside && range && standsOutside(range, outside)
        ? { ...outside, words: outside.element.textContent ?? '' }
        : undefined;
  }

  function onCompositionEnd(event: CompositionEvent) {
    const state = composing;
    composing = undefined;
    outside = undefined;
    const data = event.data;
    if (!state || !data || !state.element.isConnected) return;
    const { element, side } = state;
    // Moved out only if the markup grew by the very word: a keyboard that
    // composed again over words already there is left as it wrote them.
    const words = element.textContent ?? '';
    if (words !== (side === 'after' ? state.words + data : data + state.words))
      return;
    // The element as it was, and the word beside it.
    const before = element.cloneNode(true) as HTMLElement;
    const walker = document.createTreeWalker(before, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      texts.push(node as Text);
    const edge = side === 'after' ? texts.at(-1) : texts[0];
    if (!edge) return;
    if (side === 'after') {
      if (!edge.data.endsWith(data)) return;
      edge.data = edge.data.slice(0, -data.length);
    } else {
      if (!edge.data.startsWith(data)) return;
      edge.data = edge.data.slice(data.length);
    }
    writeBesideElement(element, data, side, before);
  }

  /**
   * Where the pointer went down and came up: a mouse places the caret as it
   * goes down, a finger only once it is lifted, so the tap is looked at on
   * both, and again whenever the caret moves while it is fresh.
   */
  function onPointer(event: PointerEvent) {
    pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
    if (event.type === 'pointerup') requestAnimationFrame(lookAtTap);
  }

  /**
   * A key pressed, or text about to go in: a tap not looked at yet — its
   * caret's change may still be on its way — is settled first, then
   * forgotten, so the letters typed after it never count as it.
   */
  function settleTap() {
    lookAtTap();
    pointer = undefined;
  }

  function onSelectionChange() {
    if (placing) {
      placing = false;
      return;
    }
    const range = collapsedCaret(root);
    if (outside && !(range && standsOutside(range, outside)))
      outside = undefined;
    lookAtTap();
  }

  /** A caret a tap put at the edge of markup, past it: stepped out of it. */
  function lookAtTap() {
    const tap = pointer;
    if (!tap || performance.now() - tap.at > POINTER_WINDOW) return;
    const range = collapsedCaret(root);
    if (!range) return;
    for (const side of ['after', 'before'] as const) {
      const element = edgeInside(range, side) ?? edgeOutside(range, side);
      if (!element) continue;
      const rects = element.getClientRects();
      const rect = side === 'after' ? rects[rects.length - 1] : rects[0];
      if (!rect || tap.y < rect.top || tap.y > rect.bottom) continue;
      const past = side === 'after' ? tap.x > rect.right : tap.x < rect.left;
      if (past) {
        // Already outside, as an earlier look at the same tap left it.
        if (outside?.element === element && standsOutside(range, outside))
          return;
        stepOut(element, side);
        return;
      }
    }
  }

  root.addEventListener('keydown', settleTap, true);
  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('beforeinput', settleTap, true);
  root.addEventListener('beforeinput', onBeforeInput, true);
  root.addEventListener('compositionstart', onCompositionStart, true);
  root.addEventListener('compositionend', onCompositionEnd, true);
  root.addEventListener('pointerdown', onPointer, true);
  root.addEventListener('pointerup', onPointer, true);
  document.addEventListener('selectionchange', onSelectionChange);
  return () => {
    root.removeEventListener('keydown', settleTap, true);
    root.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener('beforeinput', settleTap, true);
    root.removeEventListener('beforeinput', onBeforeInput, true);
    root.removeEventListener('compositionstart', onCompositionStart, true);
    root.removeEventListener('compositionend', onCompositionEnd, true);
    root.removeEventListener('pointerdown', onPointer, true);
    root.removeEventListener('pointerup', onPointer, true);
    document.removeEventListener('selectionchange', onSelectionChange);
  };
}
