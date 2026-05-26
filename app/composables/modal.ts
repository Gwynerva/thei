import type { Component } from 'vue';

export interface ModalPane {
  title: string;
  component: Component;
  props?: Record<string, unknown>;
  /** Called when this pane is popped off the stack, with optional result data. */
  onBack?: (result?: unknown) => void;
}

// Module-level singleton — modal state is client-only UI, safe per browser tab.
// shallowRef: we always replace stack.value entirely (never mutate in place),
// and components must not be made deeply reactive.
const stack = shallowRef<ModalPane[]>([]);

export const isModalOpen = computed(() => stack.value.length > 0);
export const modalStack = readonly(stack);
export const currentModalPane = computed(() => stack.value.at(-1));

function lockScroll() {
  if (import.meta.client) {
    document.documentElement.classList.add('modal-open');
  }
}

function unlockScroll() {
  if (import.meta.client) {
    document.documentElement.classList.remove('modal-open');
  }
}

export function useModal() {
  /** Open a fresh modal session (clears any existing stack). */
  function open(pane: ModalPane) {
    stack.value = [pane];
    lockScroll();
  }

  /** Push a new pane onto an already-open modal. */
  function push(pane: ModalPane) {
    stack.value = [...stack.value, pane];
  }

  /**
   * Pop the current pane. Calls the pane's onBack with the optional result.
   * Closes the modal if the stack becomes empty.
   */
  function pop(result?: unknown) {
    if (stack.value.length === 0) return;
    const top = stack.value.at(-1)!;
    stack.value = stack.value.slice(0, -1);
    top.onBack?.(result);
    if (stack.value.length === 0) {
      unlockScroll();
    }
  }

  /** Close the modal entirely, discarding all panes. */
  function close() {
    stack.value = [];
    unlockScroll();
  }

  return {
    stack: readonly(stack),
    isOpen: isModalOpen,
    currentPane: currentModalPane,
    open,
    push,
    pop,
    close,
  };
}
