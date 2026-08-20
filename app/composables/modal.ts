import {
  type Component,
  computed,
  markRaw,
  nextTick,
  shallowRef,
  watch,
} from 'vue';
import type { Router } from 'vue-router';
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

/** Close the top modal and atomically consume the attempted route navigation. */
export function interceptModalNavigation() {
  if (!activeModal.value) return false;
  queueMicrotask(() => closeModal());
  return true;
}

const MODAL_HISTORY_STATE = '__theiModal';

/** Install one route and browser-history interceptor for the complete stack. */
export function installModalNavigationInterceptor(router: Router) {
  let sentinelActive = false;
  let discardingSentinel = false;

  function pushSentinel() {
    if (sentinelActive || !activeModal.value) return;
    window.history.pushState(
      { ...window.history.state, [MODAL_HISTORY_STATE]: true },
      '',
      window.location.href,
    );
    sentinelActive = true;
  }

  function handlePopState() {
    if (discardingSentinel) {
      discardingSentinel = false;
      sentinelActive = false;
      return;
    }
    if (!sentinelActive || !activeModal.value) return;

    sentinelActive = false;
    closeModal();
    queueMicrotask(pushSentinel);
  }

  const stopStackWatch = watch(
    () => modalStack.value.length,
    (count) => {
      if (count > 0) {
        pushSentinel();
        return;
      }
      if (
        sentinelActive &&
        window.history.state?.[MODAL_HISTORY_STATE] === true
      ) {
        sentinelActive = false;
        discardingSentinel = true;
        window.history.back();
      }
    },
    { immediate: true, flush: 'sync' },
  );
  const removeRouteGuard = router.beforeEach(() => {
    if (interceptModalNavigation()) return false;
  });
  window.addEventListener('popstate', handlePopState);

  return () => {
    stopStackWatch();
    removeRouteGuard();
    window.removeEventListener('popstate', handlePopState);
  };
}

export function closeModal() {
  const modal = activeModal.value;
  if (!modal || (modal.closeGuard && !modal.closeGuard())) return false;
  removeModal(modal);
  modal.close({ type: 'empty' });
  restoreFocusAfterReturn(modal);
  return true;
}

/**
 * Close the complete modal flow with an error.
 */
export function errorModal(message: string) {
  closeActiveModal({ type: 'error', message });
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
    : [modalData: ExtractModalData<TComponent>]
): Promise<TResult> {
  const returnFocus =
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
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

export function closeActiveModal(result: BaseModalResult) {
  const modal = activeModal.value;
  if (!modal || (modal.closeGuard && !modal.closeGuard())) return false;
  removeModal(modal);
  modal.close(result);
  restoreFocusAfterReturn(modal);
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
