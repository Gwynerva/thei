<script lang="ts" setup>
// The caller positions the frame: `fixed` as a bar, `relative` inside a sheet.
defineProps<{ expanded?: boolean }>();
</script>

<template>
  <div
    class="isolate flex min-w-0 flex-col overflow-hidden rounded-t-normal border
      border-b-0 border-x-transparent border-t-border-1 bg-bg-1/85
      pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-md"
  >
    <div
      v-if="expanded"
      class="public-sheet-glow pointer-events-none absolute inset-x-0 top-0 -z-1
        h-40"
      aria-hidden="true"
    ></div>
    <slot />
  </div>
</template>

<style scoped>
/* A soft accent light at the top edge of an expanded sheet. */
.public-sheet-glow {
  background: radial-gradient(
    ellipse 75% 100% at 50% 0%,
    color-mix(in oklab, var(--color-accent) 16%, transparent),
    transparent 75%
  );
  transition: opacity 0.25s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .public-sheet-glow {
    transition: none;
  }
}
</style>
