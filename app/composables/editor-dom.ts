/**
 * Editor.js's own markup, as the editor's helpers find their way in it: the
 * classes it gives a block and a selected block, and the block of one
 * editor a node is in.
 */
export const EDITOR_BLOCK_SELECTOR = '.ce-block';
export const EDITOR_SELECTED_BLOCK_SELECTOR = '.ce-block--selected';

/** The block of the editor under `root` that `target` is in, if any. */
export function editorBlockOf(
  root: HTMLElement,
  target: EventTarget | null,
): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  const block = target.closest<HTMLElement>(EDITOR_BLOCK_SELECTOR);
  return block && root.contains(block) ? block : undefined;
}

/**
 * The block a button of Editor.js's toolbar stands beside: the one level
 * with its middle, or the nearest. Read from where the button is, not from
 * what the pointer last crossed, which can be a block gone since. Between
 * two about as near — on a phone the toolbar stands in the gap — `prefer`,
 * the block of the caret, is the one.
 */
export function editorBlockNextTo(
  root: HTMLElement,
  element: HTMLElement,
  prefer?: HTMLElement,
): HTMLElement | undefined {
  const box = element.getBoundingClientRect();
  const y = box.top + box.height / 2;
  let nearest: { block: HTMLElement; distance: number } | undefined;
  for (const block of root.querySelectorAll<HTMLElement>(
    EDITOR_BLOCK_SELECTOR,
  )) {
    if (!block.dataset.id) continue;
    const rect = block.getBoundingClientRect();
    const distance =
      y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (!nearest || distance < nearest.distance) nearest = { block, distance };
    if (distance === 0) break;
  }
  if (prefer && nearest && prefer !== nearest.block && root.contains(prefer)) {
    const rect = prefer.getBoundingClientRect();
    const distance =
      y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (distance <= nearest.distance + 2) return prefer;
  }
  return nearest?.block;
}
