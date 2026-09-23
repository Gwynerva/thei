<script setup lang="ts">
defineProps<{
  title: string;
  /**
   * Tighter padding for a block that runs the full width of a page rather than
   * sitting in the profile's narrow masonry column, where the same breathing
   * room reads as empty space.
   */
  compact?: boolean;
}>();
</script>
<template>
  <section
    class="profile-info-block relative isolate min-w-0 overflow-hidden
      rounded-normal border border-border-1 bg-bg-2 shadow-md shadow-shadow-1"
    :class="compact ? 'p-sm' : 'p-md'"
  >
    <h2
      class="text-xs font-semibold tracking-tight text-text-3 uppercase"
      :class="compact ? 'mb-xs' : 'mb-md'"
    >
      {{ title }}
    </h2>
    <slot />
  </section>
</template>

<style scoped>
/* A soft accent light leaking in from the top-left corner. */
.profile-info-block::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(
    circle at 0% 0%,
    color-mix(in oklab, var(--color-accent) 7%, transparent),
    transparent min(12rem, 50%)
  );
  content: '';
  pointer-events: none;
}
</style>
