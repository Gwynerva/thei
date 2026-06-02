<script lang="ts" setup>
import AsideModalButton from './AssetModalButton.vue';

defineProps<{
  asideTitle?: string;
}>();
</script>

<template>
  <section class="absolute flex h-dvh w-dvw flex-col sm:flex-row">
    <div class="relative flex flex-1 items-center justify-center bg-bg-1">
      <div class="absolute top-0 right-0 z-10 flex flex-col gap-sm p-sm">
        <AsideModalButton icon="close" @click="closeModal" />
        <slot name="buttons"></slot>
      </div>

      <slot name="preview"></slot>
    </div>
    <div
      class="relative w-full border-t-2 border-border-1 bg-bg-2
        shadow-[0_0_10px_6px_var(--color-shadow-3)] sm:max-w-75 sm:border-t-0
        sm:border-l sm:shadow-[0_0_10px_2px_var(--color-shadow-3)]"
    >
      <div
        class="flex justify-between border-b border-border-1 px-md py-sm
          font-bold tracking-tight text-text-2"
      >
        <div>{{ asideTitle || phrase.asset }}</div>
      </div>
      <slot name="aside"></slot>
    </div>
  </section>
</template>
