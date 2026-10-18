/**
 * A short word after something is done — «Declined», «Sent» — with at most
 * one action beside it, such as «Never offer again». One at a time: a new
 * one takes the place of the last. It lives in the top layer, so it shows
 * over an open dialog too. Only ever set in the browser, in answer to the
 * owner's click, so one value for the page is all it needs.
 */
export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void | Promise<void> };
}

/** How long a toast stays; one with an action stays longer, to be reached. */
export const TOAST_MS = 2200;
export const TOAST_ACTION_MS = 5000;

const current = shallowRef<Toast | null>(null);
let next = 0;

export function useToast() {
  return current;
}

/** Shows a toast; its id tells it from the next one. */
export function showToast(text: string, action?: Toast['action']): number {
  const id = ++next;
  current.value = { id, text, action };
  return id;
}

/**
 * Takes a toast away once what it says no longer holds — «save it», after
 * the save — unless another has taken its place since.
 */
export function hideToast(id: number | undefined) {
  if (id !== undefined && current.value?.id === id) current.value = null;
}
