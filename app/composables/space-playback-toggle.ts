const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const ACTIVATABLE_SELECTOR =
  'button, a[href], summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"]';

/**
 * Toggles playback with Space while the player is on screen.
 *
 * Matches the physical key (`KeyboardEvent.code`), so it works in any keyboard
 * layout. Text fields and unrelated focused controls keep their own Space
 * behaviour; controls inside the player are handled here so a focused play
 * button does not toggle twice. A player in a covered modal stays silent.
 */
export function useSpacePlaybackToggle(
  root: () => HTMLElement | null | undefined,
  toggle: () => void,
  enabled: () => boolean = () => true,
) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.code !== 'Space' || event.defaultPrevented) return;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const element = root();
    if (!element || !enabled() || !isElementDisplayed(element)) return;

    const dialog = activeOpenDialog();
    if (dialog && !dialog.contains(element)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(TEXT_ENTRY_SELECTOR)) return;
    if (target?.closest(ACTIVATABLE_SELECTOR) && !element.contains(target))
      return;

    event.preventDefault();
    if (!event.repeat) toggle();
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));
}
