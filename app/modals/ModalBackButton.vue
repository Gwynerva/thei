<script lang="ts" setup>
withDefaults(
  defineProps<{
    target: string;
    floating?: boolean;
  }>(),
  {
    floating: false,
  },
);
</script>

<template>
  <button
    type="button"
    :aria-label="phrase.back_to(target)"
    :data-title-popup="phrase.back_to(target)"
    class="flex shrink-0 cursor-pointer items-center justify-center gap-1
      rounded-full transition"
    :class="
      floating
        ? `h-12 border-2 border-border-3/30 bg-bg-2/60 px-sm text-text-1/70
          shadow-lg shadow-shadow-3 backdrop-blur hocus:border-border-3/50
          hocus:bg-bg-2/80 hocus:text-text-1`
        : 'h-10 px-xs text-text-3 hocus:bg-bg-3 hocus:text-text-1'
    "
    @click="backModal"
  >
    <Icon name="chevron-left" class="size-5" />
    <span class="text-sm font-semibold">{{ phrase.back }}</span>
  </button>
</template>
