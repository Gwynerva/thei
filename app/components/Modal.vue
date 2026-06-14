<script lang="ts" setup>
import { activeModal } from '#layers/thei/app/composables/modal';
import type { BaseModalResult } from '#layers/thei/app/modals/types';

const dialogElement = useTemplateRef('dialog');

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
  activeModal,
  async (modal) => {
    if (!import.meta.client) {
      return;
    }

    const dialog = dialogElement.value;

    if (!dialog) {
      return;
    }

    if (modal) {
      lockPageScroll();

      await nextTick();

      if (!dialog.open) {
        dialog.showModal();
        dialog.focus({ preventScroll: true });
      }
    } else {
      if (dialog.open) {
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
    dialogElement.value.close();
  }

  unlockPageScroll();
});

function settle(result: { type: string }) {
  const modal = activeModal.value;

  if (!modal) {
    return;
  }

  activeModal.value = null;
  modal.resolve(result);
}

function closeWithBase(result: BaseModalResult) {
  const modal = activeModal.value;

  if (!modal) {
    return;
  }

  activeModal.value = null;
  modal.close(result);
}

onErrorCaptured((err) => {
  const message = err instanceof Error ? err.message : String(err);
  closeWithBase({ type: 'error', message });
  return false;
});

function onNativeClose() {
  restorePageScroll();

  if (activeModal.value) {
    closeWithBase({ type: 'empty' });
  }
}

let mousedownOnBackdrop = false;

function onBackdropMousedown(e: MouseEvent) {
  mousedownOnBackdrop = e.target === dialogElement.value;
}

function onBackdropClick(e: MouseEvent) {
  if (mousedownOnBackdrop && e.target === dialogElement.value) {
    closeWithBase({ type: 'empty' });
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
    @mousedown="onBackdropMousedown"
    @click="onBackdropClick"
  >
    <component
      v-if="activeModal"
      :is="activeModal.component"
      v-bind="activeModal.props"
      @modalResult="settle"
    />
  </dialog>
</template>
