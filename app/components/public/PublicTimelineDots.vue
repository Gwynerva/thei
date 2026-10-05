<script lang="ts" setup>
/**
 * The dotted rail of a pause on a timeline: time that passed with nothing on
 * it. It fills the height of whatever holds it with whole dots, set as far
 * from the marks at its ends as from each other.
 */
</script>

<template>
  <span
    class="public-timeline-dots absolute left-1/2 w-1 -translate-x-1/2
      opacity-30"
    aria-hidden="true"
  ></span>
</template>

<style scoped>
/*
 * Every dot sits in the middle of a step of its own, which would leave only
 * half a gap between the end dots and the marks. The dots are drawn inset by
 * the other half — half a step, less a dot — and `round` stretches the steps
 * to fill what is left with a whole number of them, so every gap along the
 * pause is the same, the two at its ends included.
 */
.public-timeline-dots {
  --timeline-dot-radius: 0.1rem;
  --timeline-dot-step: 0.55rem;
  inset-block: calc(var(--timeline-dot-step) / 2 - var(--timeline-dot-radius));
  background: var(--color-accent);
  mask-image: radial-gradient(
    circle,
    black var(--timeline-dot-radius),
    transparent calc(var(--timeline-dot-radius) + 0.02rem)
  );
  mask-size: 100% var(--timeline-dot-step);
  mask-repeat: no-repeat round;
}
</style>
