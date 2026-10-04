<script lang="ts" setup>
/**
 * The dotted rail of a pause on a timeline: time that passed with nothing on
 * it. It fills the height of whatever holds it.
 */
defineProps<{ compact?: boolean }>();
</script>

<template>
  <span
    class="public-timeline-dots absolute inset-y-0 left-1/2 w-1 -translate-x-1/2
      [--timeline-dot-end:0.12rem] [--timeline-dot-radius:0.1rem]
      [--timeline-dot-step:0.55rem]"
    :class="
      compact
        ? 'opacity-30'
        : `opacity-80 sm:w-2 sm:[--timeline-dot-end:0.18rem]
          sm:[--timeline-dot-radius:0.16rem] sm:[--timeline-dot-step:0.8rem]`
    "
    aria-hidden="true"
  ></span>
</template>

<style scoped>
.public-timeline-dots {
  background: var(--color-accent);
  mask-image: radial-gradient(
    circle,
    black 0 var(--timeline-dot-radius),
    transparent var(--timeline-dot-end)
  );
  mask-position: center;
  mask-size: 100% var(--timeline-dot-step);
  mask-repeat: repeat-y;
}
</style>
