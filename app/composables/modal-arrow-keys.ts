/**
 * ← and → step through whatever a modal is showing.
 *
 * Ignored while typing, and with any modifier held, so the keys keep their
 * meaning in a field and in the browser's own shortcuts.
 */
export function useArrowKeys(handlers: {
  previous: () => void;
  next: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('input, textarea, select, [contenteditable]'))
    )
      return;
    if (event.key === 'ArrowLeft') handlers.previous();
    else if (event.key === 'ArrowRight') handlers.next();
    else return;
    event.preventDefault();
  }
  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
}
