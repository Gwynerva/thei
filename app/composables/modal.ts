import {
  type Component,
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
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

/**
 * Depth of the modal flows currently running.
 *
 * A flow is a sequence of modals that replace one another — a wizard. Each
 * step settles before the next one is pushed, so the stack drops to the depth
 * below in between, and for a flow started from a page that depth is zero.
 * Without this counter the history interceptor reads the gap as "the last
 * modal closed", hands the sentinel entry back, and races the next step's
 * pushState — after which Back stops closing modals at all.
 */
const modalFlowDepth = shallowRef(0);

/** Run a sequence of modals as one logical layer. See `modalFlowDepth`. */
export async function runModalFlow<T>(run: () => Promise<T>): Promise<T> {
  modalFlowDepth.value++;
  try {
    return await run();
  } finally {
    modalFlowDepth.value--;
  }
}

/**
 * Dismissible layers open inside a modal — popovers, menus, inline controls.
 *
 * They are not modals of their own, but one Back press or one Escape has to
 * undo exactly one step, and while such a layer is open that step is the
 * layer, not the modal behind it.
 */
const dismissLayers: (() => void)[] = [];

export function registerDismissLayer(close: () => void) {
  dismissLayers.push(close);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const index = dismissLayers.lastIndexOf(close);
    if (index > -1) dismissLayers.splice(index, 1);
  };
}

export function hasDismissLayer() {
  return dismissLayers.length > 0;
}

/** Undo one step: the innermost dismissible layer, else the top modal. */
export function dismissOneStep(): boolean {
  const layer = dismissLayers.pop();
  if (layer) {
    layer();
    return true;
  }
  return closeModal();
}

/** Close the top modal and atomically consume the attempted route navigation. */
export function interceptModalNavigation() {
  if (!activeModal.value) return false;
  queueMicrotask(() => closeModal());
  return true;
}

const MODAL_HISTORY_STATE = '__theiModal';

/** Released sentinel entries whose router navigation has not finished yet. */
let historyRelease: Promise<void> | undefined;

/**
 * Resolves once the history entry of a just-closed modal has been released
 * and the router has finished the navigation that release triggers. A route
 * change made earlier cancels that navigation, and the router then restores
 * the previous URL on top of it.
 */
export function modalHistorySettled(): Promise<void> {
  return historyRelease ?? Promise.resolve();
}

/** Install one route and browser-history interceptor for the complete stack. */
export function installModalNavigationInterceptor(router: Router) {
  let sentinelActive = false;
  /** `history.back()` calls we issued ourselves, not user Back presses. */
  let pendingDiscards = 0;

  function pushSentinel() {
    if (sentinelActive || !activeModal.value || activeModal.value.leaving)
      return;
    // Releasing the sentinel travels back through history, and on a freshly
    // loaded page, where Nuxt still leaves scrolling to the browser until the
    // first navigation, that trip restores the scroll the page had when the
    // modal opened, undoing whatever a link in the modal scrolled to.
    window.history.scrollRestoration = 'manual';
    window.history.pushState(
      { ...window.history.state, [MODAL_HISTORY_STATE]: true },
      '',
      window.location.href,
    );
    sentinelActive = true;
  }

  function releaseSentinel() {
    if (!sentinelActive) return;
    sentinelActive = false;
    if (window.history.state?.[MODAL_HISTORY_STATE] !== true) return;
    pendingDiscards++;
    historyRelease ??= new Promise((resolve) => {
      finishRelease = resolve;
      // A traversal the browser never reports must not block callers.
      releaseFallback = setTimeout(settleRelease, 1000);
    });
    window.history.back();
  }

  let finishRelease: (() => void) | undefined;
  let releaseFallback: ReturnType<typeof setTimeout> | undefined;
  function settleRelease() {
    if (!finishRelease) return;
    clearTimeout(releaseFallback);
    const finish = finishRelease;
    finishRelease = undefined;
    historyRelease = undefined;
    finish();
  }

  function handlePopState() {
    // One of our own discards. The entry it consumed is indistinguishable from
    // any sentinel pushed since — same URL, same marker — so `sentinelActive`
    // is left alone here: clearing it would disarm a sentinel that a modal
    // opened in the meantime has just pushed, and Back would stop working.
    if (pendingDiscards > 0) {
      pendingDiscards--;
      return;
    }
    if (!sentinelActive || !activeModal.value) return;

    // The browser consumed the sentinel entry whatever happens next, including
    // when a close guard refuses the dismissal.
    sentinelActive = false;
    dismissOneStep();
    queueMicrotask(pushSentinel);
  }

  const stopStackWatch = watch(
    () => [modalStack.value.length, modalFlowDepth.value] as const,
    ([stackSize, flowDepth]) => {
      if (stackSize > 0) {
        pushSentinel();
        return;
      }
      // A flow between two steps still owns the layer, empty stack or not.
      if (flowDepth > 0) return;
      releaseSentinel();
    },
    { immediate: true, flush: 'sync' },
  );
  const removeRouteGuard = router.beforeEach((to, from) => {
    // A sentinel pop leaves the URL untouched, so vue-router computes a delta
    // of zero for it — and then runs a full navigation anyway. Aborting that
    // navigation here would close a second modal, and the aborted pop makes
    // vue-router issue its own `history.go(-1)` on top, closing a third. The
    // two paths are equal by construction, because the sentinel is pushed with
    // the current href, so this test catches every sentinel pop and nothing
    // else. Let it through: there is nothing to navigate to.
    if (to.fullPath === from.fullPath) return;
    if (interceptModalNavigation()) return false;
  });
  // The router navigates for every popstate, our own discards included.
  const removeAfterHook = router.afterEach(settleRelease);
  window.addEventListener('popstate', handlePopState);

  return () => {
    stopStackWatch();
    removeRouteGuard();
    removeAfterHook();
    settleRelease();
    window.removeEventListener('popstate', handlePopState);
  };
}

export function closeModal() {
  const modal = activeModal.value;
  if (!modal || (modal.closeGuard && !modal.closeGuard())) return false;
  finishModal(modal, () => modal.close({ type: 'empty' }));
  return true;
}

export async function closeModalAndWait() {
  const modal = activeModal.value;
  if (!closeModal()) return false;
  await modal?.leaving;
  await nextTick();
  return true;
}

export function useModalLeaveTransition(transition: () => Promise<void>) {
  const modal = activeModal.value;
  if (!modal) throw new Error('A leave transition requires an active modal');
  modal.leaveTransition = transition;
  onBeforeUnmount(() => {
    if (modal.leaveTransition === transition) modal.leaveTransition = undefined;
  });
}

function finishModal(modal: ActiveModal, settle: () => void) {
  if (modal.leaving) return;
  const finish = () => {
    removeModal(modal);
    settle();
    restoreFocusAfterReturn(modal);
  };
  if (modal.leaveTransition) {
    modal.leaving = modal.leaveTransition().then(finish, finish);
  } else {
    finish();
  }
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
  finishModal(modal, () => modal.resolve(result));
}

export function closeActiveModal(result: BaseModalResult) {
  const modal = activeModal.value;
  if (!modal || (modal.closeGuard && !modal.closeGuard())) return false;
  finishModal(modal, () => modal.close(result));
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
