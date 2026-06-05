import { type Component, markRaw, shallowRef } from 'vue';
import type {
  ActiveModal,
  BaseModalResult,
  ExtractModalData,
  ModalDescriptor,
} from '#layers/thei/app/modals/types';

export { defineModal, type ModalData } from '#layers/thei/app/modals/types';

// Module-level singleton — one modal active at a time across the whole app.
export const activeModal = shallowRef<ActiveModal | null>(null);

/**
 * True while openModal() is awaiting a dynamic import but before the modal
 * component has been rendered. Used by Modal.vue to keep the dialog open
 * (showing a loading spinner) so there is no blank gap between modals.
 */
export const modalLoading = shallowRef(false);

/**
 * Programmatically close the active modal with an `empty` result.
 * Useful in modal components that don't use a `modalResult` emit.
 */
export function closeModal() {
  const modal = activeModal.value;
  if (!modal) return;
  activeModal.value = null;
  modal.close({ type: 'empty' });
}

/**
 * Programmatically close the active modal with an `error` result.
 * Useful in modal components that don't use a `modalResult` emit.
 */
export function errorModal(message: string) {
  const modal = activeModal.value;
  if (!modal) return;
  activeModal.value = null;
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
  if (activeModal.value) {
    throw new Error(
      `Cannot open modal "${descriptor.name}" while "${activeModal.value.name}" is already active!`,
    );
  }

  modalLoading.value = true;
  const module = await descriptor.component();
  const component = markRaw(module.default);
  const props = args.length > 0 ? { modalData: args[0] } : {};

  return new Promise<TResult>((resolve) => {
    modalLoading.value = false;
    activeModal.value = {
      name: descriptor.name,
      component,
      props,
      resolve: resolve as (result: { type: string }) => void,
      close: (result: BaseModalResult) => resolve(result as TResult),
    };
  });
}
