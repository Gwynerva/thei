import {
  editableFieldOf,
  markupAround,
  placeInRoot,
} from './editor-inline-dom';

/** One ring round one line of an element. */
const RING_CLASS = 'content-inline-ring';
/** A ring on its way out, fading. */
const LEAVING_CLASS = 'content-inline-ring--leaving';
/** Room between the words and the innermost ring; each outer one adds it. */
const PAD_X = 2;
const PAD_Y = 1;
/** Longer than the fade: a ring whose fade never ends still goes. */
const LEAVING_MS = 400;

/**
 * The markup of words the caret stands in — a link, a hint, bold, italic —
 * ringed in the accent, each line of it, the outer ones wider: what is
 * typed now goes into all of it. Out of it, by an arrow or a click past it,
 * the ring goes, and so do the words typed next
 * (`editor-inline-boundary.ts`, `editor-inline-keep.ts`).
 *
 * Only a caret is looked at, in a text of the editor that has the focus: a
 * selection is about words, not about where they go. Nothing is written
 * into the text: the rings are drawn in `root`, beside Editor.js's tree,
 * which paints over them, as the private sections' boxes are; `root` must
 * be positioned.
 */
export function bindEditorInlineCaret(root: HTMLElement) {
  const rings: HTMLElement[] = [];
  let frame: number | undefined;

  function schedule() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      draw();
    });
  }

  /** The markup round the caret, innermost first. */
  function ringed(): HTMLElement[] {
    const selection = window.getSelection();
    const node = selection?.isCollapsed ? selection.focusNode : null;
    if (!node || !root.contains(node)) return [];
    const field = editableFieldOf(node);
    if (!field?.contains(document.activeElement)) return [];
    return markupAround(node);
  }

  function draw() {
    // Hidden, under another modal: nothing to measure until it is back.
    const shown = root.getClientRects().length > 0;
    const boxes = shown
      ? ringed().flatMap((element, depth) =>
          Array.from(element.getClientRects())
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map((rect) => {
              const x = PAD_X * (depth + 1);
              const y = PAD_Y * (depth + 1);
              const { left, top } = placeInRoot(root, rect);
              return {
                left: left - x,
                top: top - y,
                width: rect.width + x * 2,
                height: rect.height + y * 2,
              };
            }),
        )
      : [];

    boxes.forEach((geometry, index) => {
      let ring = rings[index];
      if (!ring) {
        ring = document.createElement('div');
        ring.className = RING_CLASS;
        ring.setAttribute('aria-hidden', 'true');
        root.prepend(ring);
        rings.push(ring);
      }
      for (const [property, value] of Object.entries(geometry)) {
        const length = `${Math.round(value * 100) / 100}px`;
        if (ring.style.getPropertyValue(property) !== length)
          ring.style.setProperty(property, length);
      }
    });
    // The rest fade, and go once faded.
    for (const ring of rings.splice(boxes.length)) {
      ring.classList.add(LEAVING_CLASS);
      ring.addEventListener('transitionend', () => ring.remove(), {
        once: true,
      });
      setTimeout(() => ring.remove(), LEAVING_MS);
    }
  }

  // The words grow and wrap as they are typed; the column changes width.
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(root);
  document.addEventListener('selectionchange', schedule);
  root.addEventListener('input', schedule);
  root.addEventListener('focusin', schedule);
  root.addEventListener('focusout', schedule);
  schedule();

  return () => {
    resizeObserver.disconnect();
    document.removeEventListener('selectionchange', schedule);
    root.removeEventListener('input', schedule);
    root.removeEventListener('focusin', schedule);
    root.removeEventListener('focusout', schedule);
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    for (const ring of rings.splice(0)) ring.remove();
    for (const ring of root.querySelectorAll(`.${RING_CLASS}`)) ring.remove();
  };
}
