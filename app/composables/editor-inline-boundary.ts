import { selectRange } from '../components/content/editor-edit-commands';
import {
  caretAtEdge,
  caretIn,
  edgeInside,
  edgeOutside,
  oneLetterFromEdge,
  type InlineSide,
} from './editor-inline-dom';

/** A tap or a click this recent placed the caret, and may have meant beside. */
const POINTER_WINDOW = 400;

/**
 * The caret stepping in and out of the markup of words — a link, a hint,
 * bold, italic. Each edge of it is two places for the caret, outside and
 * inside, and each takes a press of an arrow of its own: at its last letter,
 * → goes after it, at its first, ← before it; beside it, → or ← goes to its
 * first or last letter before any letter is passed. A tap or a click past
 * its edge steps out too, which is the only way there is on a phone.
 *
 * Where the caret stands then decides where the words go, inside or out,
 * as the ring round the markup shows (`editor-inline-caret.ts`,
 * `editor-inline-keep.ts`). Bound before those rules, so a tap is settled
 * before a word goes where it left the caret.
 */
export function bindEditorInlineBoundary(root: HTMLElement) {
  let pointer: { x: number; y: number; at: number } | undefined;
  /** The selection change the next step makes, not the writer's. */
  let placing = false;

  function place(caret: Range) {
    placing = true;
    // A caret already there makes no change to report.
    requestAnimationFrame(() => (placing = false));
    selectRange(caret);
  }

  function stepOut(element: HTMLElement, side: InlineSide) {
    const caret = document.createRange();
    if (side === 'after') caret.setStartAfter(element);
    else caret.setStartBefore(element);
    caret.collapse(true);
    place(caret);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
      return;
    if (event.isComposing) return;
    const range = caretIn(root, { collapsed: true });
    if (!range) return;
    const side: InlineSide = event.key === 'ArrowRight' ? 'after' : 'before';
    const leaving = edgeInside(range, side);
    const entering =
      !leaving && edgeOutside(range, side === 'after' ? 'before' : 'after');
    // One letter from the edge, the caret goes to the place on this side of
    // it, where the browser would carry it over.
    const near = !leaving && !entering && oneLetterFromEdge(range, side);
    if (!leaving && !entering && !near) return;
    event.preventDefault();
    // Editor.js would take the key on to the next block.
    event.stopPropagation();
    if (leaving) stepOut(leaving, side);
    else if (entering)
      place(caretAtEdge(entering, side === 'after' ? 'start' : 'end'));
    else if (near) place(near);
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
    lookAtTap();
  }

  /** A caret a tap put inside the edge of markup, past it: stepped out. */
  function lookAtTap() {
    const tap = pointer;
    if (!tap || performance.now() - tap.at > POINTER_WINDOW) return;
    const range = caretIn(root, { collapsed: true });
    if (!range) return;
    for (const side of ['after', 'before'] as const) {
      const element = edgeInside(range, side);
      if (!element) continue;
      const rects = element.getClientRects();
      const rect = side === 'after' ? rects[rects.length - 1] : rects[0];
      if (!rect || tap.y < rect.top || tap.y > rect.bottom) continue;
      const past = side === 'after' ? tap.x > rect.right : tap.x < rect.left;
      if (past) {
        stepOut(element, side);
        return;
      }
    }
  }

  root.addEventListener('keydown', settleTap, true);
  root.addEventListener('keydown', onKeyDown, true);
  root.addEventListener('beforeinput', settleTap, true);
  root.addEventListener('compositionstart', settleTap, true);
  root.addEventListener('pointerdown', onPointer, true);
  root.addEventListener('pointerup', onPointer, true);
  document.addEventListener('selectionchange', onSelectionChange);
  return () => {
    root.removeEventListener('keydown', settleTap, true);
    root.removeEventListener('keydown', onKeyDown, true);
    root.removeEventListener('beforeinput', settleTap, true);
    root.removeEventListener('compositionstart', settleTap, true);
    root.removeEventListener('pointerdown', onPointer, true);
    root.removeEventListener('pointerup', onPointer, true);
    document.removeEventListener('selectionchange', onSelectionChange);
  };
}
