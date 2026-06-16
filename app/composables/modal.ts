import { type Component, computed, markRaw, shallowRef } from 'vue';
import type {
  ActiveModal,
  BaseModalResult,
  ExtractModalData,
  ModalDescriptor,
} from '#layers/thei/app/modals/types';

export { defineModal, type ModalData } from '#layers/thei/app/modals/types';

// Module-level singleton — one modal active at a time across the whole app.
let modalId = 0;

export const modalStack = shallowRef<ActiveModal[]>([]);
export const activeModal = computed(
  () => modalStack.value[modalStack.value.length - 1] ?? null,
);

/**
 * Programmatically close the active modal with an `empty` result.
 * Useful in modal components that don't use a `modalResult` emit.
 */
export function closeModal() {
  const modal = activeModal.value;
  if (!modal) return;
  removeModal(modal);
  modal.close({ type: 'empty' });
}

/**
 * Programmatically close the active modal with an `error` result.
 * Useful in modal components that don't use a `modalResult` emit.
 */
export function errorModal(message: string) {
  const modal = activeModal.value;
  if (!modal) return;
  removeModal(modal);
  modal.close({ type: 'error', message });
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
    : [modalData: ExtractModalData<TComponent>]
): Promise<TResult> {
  const module = await descriptor.component();
  const component = markRaw(module.default);
  const props = args.length > 0 ? { modalData: args[0] } : {};

  return new Promise<TResult>((resolve) => {
    modalStack.value = [
      ...modalStack.value,
      {
        id: ++modalId,
        name: descriptor.name,
        component,
        props,
        resolve: resolve as (result: { type: string }) => void,
        close: (result: BaseModalResult) => resolve(result as TResult),
      },
    ];
  });
}

export function settleModal(modal: ActiveModal, result: { type: string }) {
  removeModal(modal);
  modal.resolve(result);
}

export function closeModalWithBase(
  modal: ActiveModal,
  result: BaseModalResult,
) {
  removeModal(modal);
  modal.close(result);
}

function removeModal(modal: ActiveModal) {
  modalStack.value = modalStack.value.filter((item) => item.id !== modal.id);
}
