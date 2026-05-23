<script lang="ts" setup>
defineProps<{ title: string }>();

const emit = defineEmits<{ close: [] }>();

const dialogRef = ref<HTMLDialogElement>();

function open() {
  dialogRef.value?.showModal();
}

function close() {
  dialogRef.value?.close();
}

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialogRef"
    class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-normal border-2
      border-border-1 bg-bg-2 p-0 shadow-lg shadow-shadow-1 backdrop:bg-bg-1/80
      backdrop:backdrop-blur-sm"
    @close="emit('close')"
  >
    <div
      class="flex items-center justify-between border-b border-border-1 px-md
        py-sm"
    >
      <div class="font-semibold tracking-tight">{{ title }}</div>
      <button
        class="block cursor-pointer rounded-full p-1 text-text-2 transition
          hover:bg-bg-3 hover:text-text-1"
        @click="close"
      >
        <Icon name="close" class="block size-6" />
      </button>
    </div>

    <div class="p-md">
      <slot />
    </div>
  </dialog>
</template>
