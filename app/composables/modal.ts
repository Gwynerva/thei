import { type Component, computed, markRaw, nextTick, shallowRef } from 'vue';
import type {
  ActiveModal,
  BaseModalResult,
  ExtractModalData,
  ModalDescriptor,
  ModalOpenOptions,
} from '#layers/thei/app/modals/types';

export { defineModal, type ModalData } from '#layers/thei/app/modals/types';

// Module-level singleton — one modal active at a time across the whole app.
let modalId = 0;
let modalFlowId = 0;

export const modalStack = shallowRef<ActiveModal[]>([]);
export const activeModal = computed(
  () => modalStack.value[modalStack.value.length - 1] ?? null,
);
export const modalBackLabel = computed(() => {
  const active = activeModal.value;
  if (!active) return undefined;
  return (
    active.backLabel ?? modalStack.value[modalStack.value.length - 2]?.label
  );
});
export const modalDismissVersion = shallowRef(0);

export function createModalFlow() {
  return ++modalFlowId;
}

/**
 * Close the complete modal flow. A close affordance must never behave like
 * implicit backward navigation.
 */
export function closeModal() {
  requestCloseActiveModalFlow({ type: 'empty' });
}

/**
 * Return from the active step while keeping its parent flow alive.
 */
export function backModal() {
  const modal = activeModal.value;
  if (!modal) return;
  if (modal.closeGuard && !modal.closeGuard()) return;
  removeModal(modal);
  modal.close({ type: 'empty' });
  restoreFocusAfterReturn(modal);
}

/**
 * Close the complete modal flow with an error.
 */
export function errorModal(message: string) {
  closeActiveModalFlowWithBase({ type: 'error', message });
}

export function useModalCloseGuard(guard: () => boolean) {
  const modal = activeModal.value;
  if (!modal)
    throw new Error('A modal close guard must be registered inside a modal');
  modal.closeGuard = guard;

  onBeforeUnmount(() => {
    if (modal.closeGuard === guard) modal.closeGuard = undefined;
  });
}

/**
 * Open a modal, passing typed `modalData` when the component requires it.
 * Returns a Promise that resolves with a typed ModalResult when the modal
 * completes (via @modalResult emit), is closed/aborted (empty), or throws (error).
 *
 * Usage (no data):   const result = await openModal(myModal);
 * Usage (with data): const result = await openModal(myModal, { foo: 'bar' });
 */
export async function openModal<
  TResult extends { type: string },
  TComponent extends Component,
>(
  descriptor: ModalDescriptor<TResult, TComponent>,
  ...args: ExtractModalData<TComponent> extends never
    ? []
    : [modalData: ExtractModalData<TComponent>, options?: ModalOpenOptions]
): Promise<TResult> {
  const returnFocus =
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  const module = await descriptor.component();
  const component = markRaw(module.default);
  const props = args.length > 0 ? { modalData: args[0] } : {};
  const options = args[1] as ModalOpenOptions | undefined;

  return new Promise<TResult>((resolve) => {
    modalStack.value = [
      ...modalStack.value,
      {
        id: ++modalId,
        name: descriptor.name,
        component,
        props,
        label: options?.label,
        backLabel: options?.backLabel,
        flowId: options?.flowId ?? createModalFlow(),
        returnFocus,
        resolve: resolve as (result: { type: string }) => void,
        close: (result: BaseModalResult) => resolve(result as TResult),
      },
    ];
  });
}

export function settleModal(modal: ActiveModal, result: { type: string }) {
  removeModal(modal);
  modal.resolve(result);
  restoreFocusAfterReturn(modal);
}

export function closeActiveModalFlowWithBase(result: BaseModalResult) {
  const flowId = activeModal.value?.flowId;
  if (flowId === undefined) return;

  const modals = modalStack.value.filter((modal) => modal.flowId === flowId);
  modalStack.value = modalStack.value.filter(
    (modal) => modal.flowId !== flowId,
  );
  modalDismissVersion.value += 1;

  for (const modal of modals.toReversed()) {
    modal.close(result);
  }
  restoreFocusAfterReturn(modals[0]);
}

export function requestCloseActiveModalFlow(result: BaseModalResult) {
  const modal = activeModal.value;
  if (modal?.closeGuard && !modal.closeGuard()) return false;
  closeActiveModalFlowWithBase(result);
  return true;
}

function removeModal(modal: ActiveModal) {
  modalStack.value = modalStack.value.filter((item) => item.id !== modal.id);
}

function restoreFocusAfterReturn(modal: ActiveModal | undefined) {
  if (!modal?.returnFocus || modalStack.value.length === 0) return;
  void nextTick(() => {
    if (modal.returnFocus?.isConnected) {
      modal.returnFocus.focus({ preventScroll: true });
    }
  });
}
