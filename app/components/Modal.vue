<script lang="ts" setup>
const modal = useModal();
const { isOpen, stack, currentPane } = modal;
const dialogRef = ref<HTMLDialogElement>();

watch(
  isOpen,
  (val) => {
    if (!import.meta.client) {
      return;
    }

    document.documentElement.style.overflow = val ? 'hidden' : '';

    if (val) {
      nextTick(() => dialogRef.value?.showModal());
    } else {
      dialogRef.value?.close();
    }
  },
  { immediate: true },
);

function onCancel(e: Event) {
  e.preventDefault();
  dismiss();
}

let mousedownOnBackdrop = false;

function onDialogMousedown(e: MouseEvent) {
  mousedownOnBackdrop = e.target === dialogRef.value;
}

function onDialogClick(e: MouseEvent) {
  if (e.target === dialogRef.value && mousedownOnBackdrop) dismiss();
}

function dismiss() {
  if (stack.value.length > 1) {
    modal.pop();
  } else {
    modal.close();
  }
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-normal border-2
        border-border-1 bg-bg-2 p-0 shadow-lg shadow-shadow-1
        backdrop:bg-bg-1/80 backdrop:backdrop-blur-sm"
      @cancel="onCancel"
      @mousedown="onDialogMousedown"
      @click="onDialogClick"
    >
      <!-- Header -->
      <div
        class="flex items-center gap-sm border-b border-border-1 px-md py-sm"
      >
        <!-- Back button (shown when there is a previous pane) -->
        <button
          v-if="stack.length > 1"
          class="shrink-0 cursor-pointer rounded-full p-1 text-text-2 transition
            hocus:bg-bg-3 hocus:text-text-1"
          @click="modal.pop()"
        >
          <Icon name="chevron-right" class="block size-5 rotate-180" />
        </button>

        <!-- Breadcrumb + current title -->
        <div class="min-w-0 flex-1">
          <!-- Previous pane titles -->
          <div
            v-if="stack.length > 1"
            class="flex min-w-0 items-center gap-0.5 truncate text-xs
              text-text-2"
          >
            <template v-for="(pane, i) in stack.slice(0, -1)" :key="i">
              <span v-if="i > 0" class="shrink-0">›</span>
              <span class="truncate">{{ pane.title }}</span>
            </template>
          </div>
          <!-- Current title -->
          <div class="truncate font-semibold tracking-tight">
            {{ currentPane?.title }}
          </div>
        </div>

        <!-- Close button -->
        <button
          class="shrink-0 cursor-pointer rounded-full p-1 text-text-2 transition
            hocus:bg-bg-3 hocus:text-text-1"
          @click="modal.close()"
        >
          <Icon name="close" class="block size-6" />
        </button>
      </div>

      <!-- Pane content: all panes in the stack stay mounted (v-show) so their
           reactive state survives navigating back to a previous pane. -->
      <div
        v-for="(pane, i) in stack"
        :key="(pane as any)._id"
        class="p-md"
        v-show="i === stack.length - 1"
      >
        <component :is="pane.component" v-bind="pane.props" />
      </div>
    </dialog>
  </Teleport>
</template>
