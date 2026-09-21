<script setup lang="ts">
defineProps<{ title: string }>();
</script>
<template>
  <section
    class="profile-info-block relative isolate min-w-0 overflow-hidden
      rounded-normal border border-border-1 bg-bg-2 p-md shadow-md
      shadow-shadow-1"
  >
    <h2
      class="mb-md text-xs font-semibold tracking-tight text-text-3 uppercase"
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
