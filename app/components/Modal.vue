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

function isCard(layer: ModalLayer | undefined) {
  return layer?.framed?.frame?.kind === 'card';
}

/**
 * The blurred page under cards is one for all of them, drawn beneath every
 * layer while a card is anywhere on the stack: a card over a card never
 * blurs it twice, and the blur fades by itself. Inside a fading layer it
 * would draw nothing until the fade ended, and then snap in.
 */
const backdropShown = computed(() => layers.value.some(isCard));

function layerElement(key: string | undefined) {
  if (!key) return undefined;
  return (
    dialogElement.value?.querySelector<HTMLElement>(
      `:scope > [data-modal-layer="${CSS.escape(key)}"]`,
    ) ?? undefined
  );
}

/**
 * Two cards of a stack, the one coming and the one it covers or uncovers,
 * cross over the blurred page they share: each of another size, neither may
 * vanish at once from around the other. A wait keeps the card that left
 * whole beneath it, as any layer does.
 */
function crossing(coming: Element, other: HTMLElement | undefined) {
  return (
    other !== undefined &&
    other !== coming &&
    'modalCard' in (coming as HTMLElement).dataset &&
    'modalCard' in other.dataset &&
    !(coming as HTMLElement).dataset.modalLayer!.startsWith('wait:') &&
    !other.dataset.modalLayer!.startsWith('wait:')
  );
}

/**
 * A layer fades in over the one it covers. The wait between two steps does so
 * only once a transition's length has passed: a step that follows at once, or
 * a flow that ends, never shows it, and the step that left stays beneath it
 * until then. A card over a card takes the other's place as it comes.
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
  // The card it covers, still on the stack; one leaving fades by itself.
  const covered = layers.value.some((layer) => layer.key === settledTop.value)
    ? layerElement(settledTop.value)
    : undefined;
  if (crossing(element, covered)) void fadeElement(covered!, 0);
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
  // it uncovers. A card and a card cross instead: the uncovered one comes
  // back as this one goes, the coming one as this one gives way.
  const replaced = Boolean(topKey.value) && settledTop.value !== topKey.value;
  const top = layerElement(topKey.value);
  const crossed = crossing(element, top);
  if (crossed && !replaced) void fadeElement(top!, 1);
  void (replaced && !crossed ? whenTopSettled() : Promise.resolve())
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
 * Before a layer is hidden — covered by another, or leaving — the focus
 * leaves it for the dialog itself: a layer is made `inert` and
 * `aria-hidden` as it stops being the top one, and the browser refuses to
 * hide the element a reader is on. The watcher below hands the focus on.
 */
watch(
  topKey,
  (top) => {
    if (!import.meta.client) return;
    const dialog = dialogElement.value;
    const focused = document.activeElement;
    if (!dialog?.open || !(focused instanceof HTMLElement)) return;
    const layer = focused.closest<HTMLElement>('[data-modal-layer]');
    if (!layer || !dialog.contains(layer) || layer.dataset.modalLayer === top)
      return;
    dialog.focus({ preventScroll: true });
  },
  { flush: 'pre' },
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

/**
 * The dialog's own close request undoes one step. A file input inside it
 * fires a `cancel` of its own when its picker is dismissed, and that one
 * bubbles here: it closes nothing.
 */
function onDialogCancel(e: Event) {
  if (e.target !== dialogElement.value) return;
  e.preventDefault();
  dismissOneStep();
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
    @cancel="onDialogCancel"
    @click="onBackdropClick"
  >
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition-opacity motion-reduce:transition-none"
      leave-to-class="opacity-0"
      leave-active-class="transition-opacity motion-reduce:transition-none"
    >
      <div
        v-if="backdropShown"
        class="absolute inset-0 bg-bg-2 sm:bg-bg-1/40 sm:backdrop-blur-md
          dark:sm:bg-bg-1/80"
        aria-hidden="true"
        data-modal-backdrop
      ></div>
    </Transition>
    <TransitionGroup :css="false" @enter="onLayerEnter" @leave="onLayerLeave">
      <!-- Each layer, and the modal and shell in it, is a stacking of its
           own: they lie in their order, and a z-index inside the one beneath
           — Editor.js has several — never reaches over one fading in or out
           above it. -->
      <div
        v-for="layer in layers"
        :key="layer.key"
        class="absolute inset-0 isolate *:isolate"
        :data-modal-layer="layer.key"
        :data-modal-motion="
          layer.framed?.frame?.kind === 'sheet' ? 'self' : undefined
        "
        :data-modal-card="isCard(layer) || undefined"
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
