import { type Component, markRaw } from 'vue';

export interface ModalPane {
  title: string;
  component: Component;
  props?: Record<string, unknown>;
  /** Called when this pane is popped off the stack, with optional result data. */
  onBack?: (result?: unknown) => void;
}

// Internal: each push gets a stable unique ID so Modal.vue v-for :key never
// maps the same DOM node to two different pushes of the same component.
type StackEntry = ModalPane & { readonly _id: number };

let _nextId = 0;

// Module-level singleton — modal state is client-only UI, safe per browser tab.
// shallowRef: we always replace stack.value entirely (never mutate in place),
// and components must not be made deeply reactive.
const stack = shallowRef<StackEntry[]>([]);

export const isModalOpen = computed(() => stack.value.length > 0);
export const modalStack = readonly(stack);
export const currentModalPane = computed(() => stack.value.at(-1));

export function useModal() {
  /** Open a fresh modal session (clears any existing stack). */
  function open(pane: ModalPane) {
    stack.value = [
      { ...pane, component: markRaw(pane.component), _id: ++_nextId },
    ];
  }

  /** Push a new pane onto an already-open modal. */
  function push(pane: ModalPane) {
    stack.value = [
      ...stack.value,
      { ...pane, component: markRaw(pane.component), _id: ++_nextId },
    ];
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
  }

  /** Close the modal entirely, discarding all panes. */
  function close() {
    stack.value = [];
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
