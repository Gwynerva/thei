<script lang="ts" setup>
/**
 * Three pulsing dots: a model at work. Named when they stand alone, left to
 * the words beside them otherwise.
 */
defineProps<{ label?: string }>();
</script>

<template>
  <span
    class="inline-flex gap-0.75"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <i
      v-for="dot in 3"
      :key="dot"
      class="size-1.25 animate-pulse rounded-full bg-accent"
      :style="{ animationDelay: `${dot * 0.15}s` }"
    ></i>
  </span>
</template>
