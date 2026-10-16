<script lang="ts" setup>
import {
  activeModal,
  closeActiveModal,
  closeModal,
  dismissOneStep,
  hasDismissLayer,
  installModalNavigationInterceptor,
  modalStack,
  modalWait,
  settleModal,
} from '#layers/thei/app/composables/modal';
import type { ActiveModal } from '#layers/thei/app/modals/types';
import {
  fadeElement,
  fadeShellOut,
  markShellShown,
} from '#layers/thei/app/modals/layer-motion';
import ModalShell from '#layers/thei/app/modals/ModalShell.vue';

const dialogElement = useTemplateRef('dialog');
const router = useRouter();

let ignoreNextDialogClose = false;
let removeNavigationInterceptor: (() => void) | undefined;
let scrollLock:
  | {
      x: number;
      y: number;
      previousActiveElement: HTMLElement | null;
      documentOverflow: string;
    }
  | undefined;

/**
 * What the dialog shows, bottom to top: every open modal, and, while a flow
 * is between two steps, the frame of the step that left, waiting. Only the
 * top one is seen, except for the moment one fades in over another.
 */
interface ModalLayer {
  key: string;
  /** The modal; absent for the wait between two steps. */
  modal?: ActiveModal;
  /** Whose frame and title stand in while the modal or the next step loads. */
  framed?: ActiveModal;
}

const layers = computed<ModalLayer[]>(() => {
  const list: ModalLayer[] = modalStack.value.map((modal) => ({
    key: `modal:${modal.id}`,
    modal,
    framed: modal,
  }));
  const wait = modalWait.value;
  if (wait) list.push({ key: `wait:${wait.id}`, framed: wait.last });
  return list;
});
const topKey = computed(() => layers.value.at(-1)?.key);

function layerTitle(layer: ModalLayer) {
  const frame = layer.framed?.frame;
  if (!frame || frame.kind === 'sheet') return undefined;
  return frame.title(
    (layer.framed!.props as { modalData?: unknown }).modalData,
  );
}

/**
 * The top layer once it is fully in. A layer coming in fades in over the one
 * that was on top, which stays on show beneath it until then; a layer
 * uncovered by the one above it leaving is in at once.
 */
const settledTop = shallowRef<string>();
let renderedKeys = new Set<string>();
/** Layers still fading in: on show already, but not yet whole. */
const enteringKeys = new Set<string>();
watch(
  layers,
  (now) => {
    const top = now.at(-1)?.key;
    if (top && renderedKeys.has(top) && !enteringKeys.has(top))
      settledTop.value = top;
  },
  { flush: 'pre' },
);
watch(
  layers,
  (now) => {
    renderedKeys = new Set(now.map((layer) => layer.key));
  },
  { flush: 'post' },
);

function whenTopSettled() {
  return new Promise<void>((resolve) => {
    const stop = watch(
      [topKey, settledTop],
      ([top, settled]) => {
        if (top && top !== settled) return;
        queueMicrotask(() => stop());
        resolve();
      },
      { immediate: true },
    );
  });
}

/** A sheet moves in and out by itself. */
function movesItself(element: Element) {
  return element instanceof HTMLElement && 'modalMotion' in element.dataset;
}

/**
 * A layer fades in over the one it covers. The wait between two steps does so
 * only once a transition's length has passed: a step that follows at once, or
 * a flow that ends, never shows it, and the step that left stays beneath it
 * until then.
 */
function onLayerEnter(element: Element, done: () => void) {
  const key = (element as HTMLElement).dataset.modalLayer!;
  const settle = () => {
    if (!enteringKeys.delete(key)) return;
    if (key === topKey.value) settledTop.value = key;
    done();
  };
  enteringKeys.add(key);
  if (movesItself(element)) return settle();
  void fadeElement(element, 1, { late: key.startsWith('wait:') }).then(settle);
}

/** Layers leaving: the dialog stays open until the last one has gone. */
const leavingLayers = ref(0);

function onLayerLeave(element: Element, done: () => void) {
  leavingLayers.value++;
  const finish = () => {
    leavingLayers.value--;
    done();
  };
  (element as HTMLElement).inert = true;
  element.setAttribute('aria-hidden', 'true');
  // Taken away before it was whole: it never settles.
  enteringKeys.delete((element as HTMLElement).dataset.modalLayer!);
  if (movesItself(element)) return finish();
  // Replaced by a layer coming in, it stays beneath that one until it is
  // whole, so nothing behind them shows through; closed, it fades off what
  // it uncovers.
  const replaced = Boolean(topKey.value) && settledTop.value !== topKey.value;
  void (replaced ? whenTopSettled() : Promise.resolve())
    .then(() => fadeElement(element, 0))
    .then(finish);
}

const dialogShown = computed(
  () => layers.value.length > 0 || leavingLayers.value > 0,
);

function lockPageScroll() {
  if (scrollLock) {
    return;
  }

  scrollLock = {
    x: window.scrollX,
    y: window.scrollY,
    previousActiveElement:
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    documentOverflow: document.documentElement.style.overflow,
  };

  document.documentElement.style.overflow = 'clip';
}

function unlockPageScroll() {
  if (!scrollLock) {
    return;
  }

  const { x, y } = scrollLock;

  document.documentElement.style.overflow = scrollLock.documentOverflow;

  scrollLock.previousActiveElement?.focus({ preventScroll: true });
  scrollLock = undefined;

  window.scrollTo(x, y);
}

function restorePageScroll() {
  if (!scrollLock) {
    return;
  }

  const { x, y } = scrollLock;

  requestAnimationFrame(() => {
    window.scrollTo(x, y);
  });
}

watch(
  dialogShown,
  async (shown) => {
    if (!import.meta.client) {
      return;
    }

    const dialog = dialogElement.value;

    if (!dialog) {
      return;
    }

    if (shown) {
      lockPageScroll();

      await nextTick();

      if (!dialog.open) {
        dialog.showModal();
        dialog.focus({ preventScroll: true });
      }
    } else {
      if (dialog.open) {
        ignoreNextDialogClose = true;
        dialog.close();
      }
      unlockPageScroll();
    }
  },
  { flush: 'post' },
);

/**
 * The focus follows the top layer: a step that replaced another, or a modal
 * that came in over the one holding the focus, leaves it on nothing that is
 * still in use. A modal that focused something of its own keeps it.
 */
watch(
  topKey,
  async () => {
    if (!import.meta.client) return;
    await nextTick();
    const dialog = dialogElement.value;
    const top = dialog?.querySelector<HTMLElement>(
      `[data-modal-layer="${topKey.value}"]`,
    );
    if (!dialog?.open || !top || top.contains(document.activeElement)) return;
    dialog.focus({ preventScroll: true });
  },
  { flush: 'post' },
);

/**
 * Escape undoes exactly one step, the same step browser Back undoes.
 *
 * The listener sits on `document`, not on the dialog, because a dismissible
 * layer can be open with no modal at all — a popover on a plain page. Matching
 * on both `key` and `code` keeps it working under any keyboard layout and any
 * remapping, and `defaultPrevented` leaves the key to whatever already claimed
 * it, such as an Editor.js popover closing itself.
 */
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  if (event.key !== 'Escape' && event.code !== 'Escape') return;
  if (!hasDismissLayer() && !activeModal.value) return;
  event.preventDefault();
  dismissOneStep();
}

onMounted(() => {
  removeNavigationInterceptor = installModalNavigationInterceptor(router);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  removeNavigationInterceptor?.();

  if (!import.meta.client) {
    return;
  }

  document.removeEventListener('keydown', onDocumentKeydown);

  if (dialogElement.value?.open) {
    ignoreNextDialogClose = true;
    dialogElement.value.close();
  }

  unlockPageScroll();
});

onErrorCaptured((err) => {
  const message = err instanceof Error ? err.message : String(err);
  closeActiveModal({ type: 'error', message });
  return false;
});

function onNativeClose() {
  restorePageScroll();

  if (ignoreNextDialogClose) {
    ignoreNextDialogClose = false;
    return;
  }

  if (activeModal.value) {
    closeModal();
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === dialogElement.value) closeModal();
}
</script>

<template>
  <dialog
    ref="dialog"
    autofocus
    class="m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0
      bg-transparent p-0 outline-none backdrop:bg-transparent"
    @close="onNativeClose"
    @cancel.prevent="dismissOneStep"
    @click="onBackdropClick"
  >
    <TransitionGroup :css="false" @enter="onLayerEnter" @leave="onLayerLeave">
      <div
        v-for="layer in layers"
        :key="layer.key"
        class="absolute inset-0"
        :data-modal-layer="layer.key"
        :data-modal-motion="
          layer.framed?.frame?.kind === 'sheet' ? 'self' : undefined
        "
        :hidden="layer.key !== topKey && layer.key !== settledTop"
        :inert="layer.key !== topKey"
        :aria-hidden="layer.key === topKey ? undefined : 'true'"
      >
        <component
          :is="layer.modal.component"
          v-if="layer.modal?.component"
          v-bind="layer.modal.props"
          @modalResult="
            (result: { type: string }) => settleModal(layer.modal!, result)
          "
        />
        <!-- What arrives is drawn beneath its shell, which fades off it. -->
        <Transition
          :css="false"
          appear
          @enter="markShellShown"
          @leave="fadeShellOut"
        >
          <ModalShell
            v-if="!layer.modal?.component"
            :frame="layer.framed?.frame"
            :title="layerTitle(layer)"
            :closable="Boolean(layer.modal)"
          />
        </Transition>
      </div>
    </TransitionGroup>
  </dialog>
</template>
