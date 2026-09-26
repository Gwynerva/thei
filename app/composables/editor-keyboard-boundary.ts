/**
 * Keeps Editor.js out of the keyboard of everything around it.
 *
 * Editor.js listens to every keydown on the page and hands the ones typed
 * outside its blocks to the block it last worked with: an arrow key or Tab
 * in a popup's field moves the caret in the text and takes the focus with
 * it, and a "/" typed there opens the toolbox of an empty block. It cannot
 * be told to stop, and a popup cannot stand inside the editor without the
 * editor's own styles reaching it.
 *
 * Editor.js reads a key by the old `keyCode`, and a slash by `key` and
 * `code`; the fields and popups around it read `key`, and the browser types,
 * moves focus and submits forms from the key itself, not from these
 * properties. So a keydown from outside the editor is shown to Editor.js as
 * no key at all, and to everything else as it is.
 */
export function bindEditorKeyboardBoundary(
  scope: HTMLElement,
  editor: HTMLElement,
) {
  function hide(event: KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!scope.contains(target) || editor.contains(target)) return;
    Object.defineProperty(event, 'keyCode', { value: 0 });
    if (event.key === '/') {
      Object.defineProperty(event, 'key', { value: '' });
      Object.defineProperty(event, 'code', { value: '' });
    }
  }

  // The window hears the event before the document, where Editor.js listens.
  window.addEventListener('keydown', hide, true);
  return () => window.removeEventListener('keydown', hide, true);
}
