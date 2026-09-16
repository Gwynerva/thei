<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{ icon: IconName; title: string; description?: string }>();
</script>

<template>
  <div
    class="relative isolate flex flex-col items-center overflow-hidden
      rounded-normal border border-dashed border-border-2 bg-bg-2/60 px-md py-lg
      text-center sm:py-xl"
    data-empty-state
  >
    <div
      class="empty-state-glow pointer-events-none absolute inset-x-0 top-0 -z-1
        h-40"
      aria-hidden="true"
    ></div>
    <span
      class="mb-sm flex size-16 items-center justify-center rounded-full border
        border-accent/25 bg-bg-accent text-3xl text-accent shadow-lg ring-8
        shadow-accent/15 ring-bg-accent/40"
      aria-hidden="true"
    >
      <Icon :name="icon" />
    </span>
    <p class="text-lg font-semibold tracking-tight text-balance">
      {{ title }}
    </p>
    <p
      v-if="description"
      class="mt-1 max-w-110 text-sm text-balance text-text-2"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.default"
      class="mt-md flex flex-wrap items-center justify-center gap-xs"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state-glow {
  background: radial-gradient(
    ellipse 50% 100% at 50% 0%,
    color-mix(in oklab, var(--color-accent) 12%, transparent),
    transparent
  );
}
</style>
