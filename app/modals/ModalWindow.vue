<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    title: string;
    width?: string;
  }>(),
  {
    width: '30rem',
  },
);

const windowStyle = computed<Record<string, string>>(() => ({
  '--modal-window-width': props.width,
}));
</script>

<template>
  <section
    class="pointer-events-none absolute inset-0 flex bg-bg-2 sm:items-center
      sm:justify-center sm:bg-bg-1/55 sm:p-window sm:backdrop-blur-md"
    :style="windowStyle"
  >
    <div
      v-bind="$attrs"
      class="pointer-events-auto flex h-dvh w-dvw flex-col overflow-hidden
        bg-bg-2 text-text-1 sm:h-auto
        sm:max-h-[min(720px,calc(100dvh_-_var(--spacing-window)_-_var(--spacing-window)))]
        sm:w-[min(var(--modal-window-width),calc(100dvw_-_var(--spacing-window)_-_var(--spacing-window)))]
        sm:rounded-normal sm:border sm:border-border-1
        sm:shadow-[0_0_28px_8px_var(--color-shadow-2)]"
    >
      <header
        class="flex shrink-0 items-center gap-sm border-b border-border-1
          bg-bg-2 px-sm py-xs sm:px-md"
      >
        <div class="min-w-0 flex-1 truncate font-bold tracking-tight">
          <slot name="title">{{ title }}</slot>
        </div>

        <slot name="header-actions"></slot>

        <button
          type="button"
          aria-label="Close modal"
          class="flex size-10 shrink-0 cursor-pointer items-center
            justify-center rounded-full text-text-3 transition hocus:bg-bg-3
            hocus:text-text-1"
          @click="closeModal"
        >
          <Icon name="close" class="size-5" />
        </button>
      </header>

      <div class="scrollbar-mini min-h-0 flex-1 overflow-y-auto p-sm sm:p-md">
        <slot></slot>
      </div>
    </div>
  </section>
</template>
