/**
 * A click the page may take as its own: the main button, no key held. One
 * with Ctrl, ⌘, Shift or Alt, or with another button, is the browser's — a
 * new tab, a new window, a download — and goes where its link goes.
 */
export function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
