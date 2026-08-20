<script lang="ts" setup>
import {
  activeModal,
  closeActiveModal,
  closeModal,
  installModalNavigationInterceptor,
  modalStack,
  settleModal,
} from '#layers/thei/app/composables/modal';
import type { BaseModalResult } from '#layers/thei/app/modals/types';

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

onMounted(() => {
  removeNavigationInterceptor = installModalNavigationInterceptor(router);
});

onBeforeUnmount(() => {
  removeNavigationInterceptor?.();

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
    @cancel.prevent="closeModal"
    @keydown.esc.stop.prevent="closeModal"
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
