<script lang="ts" setup>
import {
  activeModal,
  closeActiveModalFlowWithBase,
  modalStack,
  settleModal,
} from '#layers/thei/app/composables/modal';
import type { BaseModalResult } from '#layers/thei/app/modals/types';

const dialogElement = useTemplateRef('dialog');

let ignoreNextDialogClose = false;
let scrollLock:
  | {
      x: number;
      y: number;
      previousActiveElement: HTMLElement | null;
      documentOverflow: string;
    }
  | undefined;

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
  () => modalStack.value.length,
  async (count) => {
    if (!import.meta.client) {
      return;
    }

    const dialog = dialogElement.value;

    if (!dialog) {
      return;
    }

    if (count > 0) {
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

onBeforeUnmount(() => {
  if (!import.meta.client) {
    return;
  }

  if (dialogElement.value?.open) {
    ignoreNextDialogClose = true;
    dialogElement.value.close();
  }

  unlockPageScroll();
});

onErrorCaptured((err) => {
  const message = err instanceof Error ? err.message : String(err);
  closeActiveModalFlowWithBase({ type: 'error', message });
  return false;
});

function onNativeClose() {
  restorePageScroll();

  if (ignoreNextDialogClose) {
    ignoreNextDialogClose = false;
    return;
  }

  if (activeModal.value) {
    closeActiveModalFlowWithBase({ type: 'empty' });
  }
}

let mousedownOnBackdrop = false;

function onBackdropMousedown(e: MouseEvent) {
  mousedownOnBackdrop = e.target === dialogElement.value;
}

function onBackdropClick(e: MouseEvent) {
  if (mousedownOnBackdrop && e.target === dialogElement.value) {
    closeActiveModalFlowWithBase({ type: 'empty' });
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    autofocus
    class="m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0
      bg-transparent p-0 outline-none backdrop:bg-transparent"
    @close="onNativeClose"
    @cancel.prevent="closeActiveModalFlowWithBase({ type: 'empty' })"
    @keydown.esc.stop.prevent="closeActiveModalFlowWithBase({ type: 'empty' })"
    @mousedown="onBackdropMousedown"
    @click="onBackdropClick"
  >
    <component
      v-for="(modal, index) in modalStack"
      v-show="index === modalStack.length - 1"
      :key="modal.id"
      :is="modal.component"
      v-bind="modal.props"
      @modalResult="(result: { type: string }) => settleModal(modal, result)"
    />
  </dialog>
</template>
