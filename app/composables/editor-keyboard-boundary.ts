/**
 * Keeps Editor.js out of the keyboard of everything around it.
 *
 * Editor.js listens to every keydown on the page and hands the ones typed
 * outside its blocks to the block it last worked with: an arrow key or Tab
 * in a popup's field moves the caret in the text and takes the focus with
 * it, and a "/" typed there opens the toolbox of an empty block. It cannot
 * be told to stop, and a popup cannot stand inside the editor without the
 * editor's own styles reaching it.
 */
export function bindEditorKeyboardBoundary(
  scope: HTMLElement,
  editor: HTMLElement,
) {
  function hide(event: KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!scope.contains(target) || editor.contains(target)) return;
    hideKeyFromEditor(event);
  }

  // The window hears the event before the document, where Editor.js listens.
  window.addEventListener('keydown', hide, true);
  return () => window.removeEventListener('keydown', hide, true);
}

/**
 * Shows a keydown to Editor.js as no key at all, and to everything else as
 * it is.
 *
 * Editor.js reads a key by the old `keyCode`, a "/" by `key`, and its
 * Ctrl+/ by `code` — which on another layout is the same physical key with
 * another character on it. The fields and popups around it read `key`, and
 * the browser types, moves focus and submits forms from the key itself, not
 * from these properties.
 */
export function hideKeyFromEditor(event: KeyboardEvent) {
  // Configurable, so hiding a key twice is harmless.
  Object.defineProperty(event, 'keyCode', { value: 0, configurable: true });
  if (event.key === '/')
    Object.defineProperty(event, 'key', { value: '', configurable: true });
  if (event.code === 'Slash')
    Object.defineProperty(event, 'code', { value: '', configurable: true });
}
