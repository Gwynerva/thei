<script lang="ts" setup>
import AsideModalButton from './AssetModalButton.vue';

defineProps<{
  asideTitle?: string;
}>();

const isAsideOpen = ref(true);
</script>

<template>
  <section class="absolute flex h-dvh w-dvw flex-col sm:flex-row">
    <div class="relative flex flex-1 items-center justify-center bg-bg-1">
      <div
        class="absolute top-0 right-0 z-10 flex flex-row-reverse gap-sm p-sm
          sm:flex-col"
      >
        <AsideModalButton icon="close" @click="closeModal" />
        <slot name="buttons"></slot>
      </div>

      <slot name="preview"></slot>
    </div>
    <div
      class="relative flex w-full flex-col border-t-2 border-border-1 bg-bg-2
        shadow-[0_0_10px_6px_var(--color-shadow-3)] sm:max-w-75 sm:border-t-0
        sm:border-l sm:shadow-[0_0_10px_2px_var(--color-shadow-3)]"
    >
      <div
        class="flex shrink-0 items-center justify-between border-b
          border-border-1 p-sm font-bold tracking-tight text-text-2"
      >
        <div>{{ asideTitle || phrase.asset }}</div>
        <button
          class="flex cursor-pointer items-center justify-center text-text-2
            transition sm:hidden hocus:text-text-1"
          @click="isAsideOpen = !isAsideOpen"
        >
          <Icon
            :name="isAsideOpen ? 'collapse-vertical' : 'expand-vertical'"
            class="size-5"
          />
        </button>
      </div>
      <div
        class="aside-content-panel"
        :style="{ '--aside-h': isAsideOpen ? 'auto' : '0px' }"
      >
        <div class="max-h-[60dvh] overflow-y-auto sm:h-full sm:max-h-none">
          <slot name="aside"></slot>
        </div>
      </div>
    </div>
  </section>
</template>
