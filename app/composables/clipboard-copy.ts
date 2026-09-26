/**
 * Copying with a visible "done": which of the copy buttons on screen shows its
 * check, for a couple of seconds.
 *
 * A key tells the buttons apart — one per link in a list, or "link" and "qr"
 * side by side. A browser that refuses the clipboard simply shows no check;
 * whatever was being copied is still on screen to select by hand.
 */
export function useClipboardCopy<Key extends string = string>(duration = 2000) {
  const copied = ref<Key>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flash(key: Key) {
    copied.value = key;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = undefined), duration);
  }

  async function copyText(key: Key, text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      flash(key);
      return true;
    } catch {
      return false;
    }
  }

  onBeforeUnmount(() => clearTimeout(timer));

  return { copied: readonly(copied), copyText, flash };
}
