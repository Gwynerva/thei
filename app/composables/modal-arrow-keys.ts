/** Controls whose own value the arrows move, and places that use them. */
const OWN_ARROWS_SELECTOR =
  'input[type="range"], input[type="radio"], [data-own-arrows]';

/**
 * ← and → step through whatever a modal is showing.
 *
 * Ignored while typing, on a control the arrows move, and with any modifier
 * held, so the keys keep their meaning in a field and in the browser's own
 * shortcuts.
 */
export function useArrowKeys(handlers: {
  previous: () => void;
  next: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (isEditableTarget(target)) return;
    if (target instanceof Element && target.closest(OWN_ARROWS_SELECTOR))
      return;
    if (event.key === 'ArrowLeft') handlers.previous();
    else if (event.key === 'ArrowRight') handlers.next();
    else return;
    event.preventDefault();
  }
  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
}
