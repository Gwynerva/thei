<script lang="ts" setup>
import { activeModal, modalLoading } from '#layers/thei/app/composables/modal';
import type { BaseModalResult } from '#layers/thei/app/modals/types';

const dialogElement = useTemplateRef('dialog');

let isProgrammaticClose = false;

watchEffect(() => {
  if (!import.meta.client) {
    return;
  }

  if (!dialogElement.value) {
    return;
  }

  if (activeModal.value || modalLoading.value) {
    if (!dialogElement.value.open) {
      dialogElement.value.showModal();
    }
    document.body.style.overflow = 'hidden';
    document.body.style.scrollbarGutter = 'stable';
  } else {
    if (dialogElement.value.open) {
      isProgrammaticClose = true;
      dialogElement.value.close();
    }
    document.body.style.overflow = '';
    document.body.style.scrollbarGutter = '';
  }
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

function onNativeClose() {
  if (isProgrammaticClose) {
    isProgrammaticClose = false;
    return;
  }
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

onErrorCaptured((err) => {
  const message = err instanceof Error ? err.message : String(err);
  closeWithBase({ type: 'error', message });
  return false;
});
</script>

<template>
  <dialog
    ref="dialog"
    @close="onNativeClose"
    @mousedown="onBackdropMousedown"
    @click="onBackdropClick"
    class="relative min-h-screen min-w-screen overscroll-contain bg-transparent
      outline-none"
  >
    <component
      v-if="activeModal"
      :is="activeModal.component"
      v-bind="activeModal.props"
      @modalResult="settle"
    />
    <div
      v-else-if="modalLoading"
      class="absolute inset-0 flex min-h-screen min-w-screen items-center
        justify-center"
    >
      <Icon name="loading" class="text-[5em] text-text-2" />
    </div>
  </dialog>
</template>
