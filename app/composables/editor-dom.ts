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
