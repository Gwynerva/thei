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
 * Open a modal, passing typed `modalData` when the component requires it.
 * Returns a Promise that resolves with a typed ModalResult when the modal
 * completes (via @complete emit), is closed/aborted (empty), or throws (error).
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

  const module = await descriptor.component();
  const component = markRaw(module.default);
  const props = args.length > 0 ? { modalData: args[0] } : {};

  return new Promise<TResult>((resolve) => {
    activeModal.value = {
      name: descriptor.name,
      component,
      props,
      resolve: resolve as (result: { type: string }) => void,
      close: (result: BaseModalResult) => resolve(result as TResult),
    };
  });
}
