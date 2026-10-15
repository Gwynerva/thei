<script lang="ts" setup>
/**
 * A few words or a number in a pill, as the AI pages mark what waits, what
 * went in and what is uncertain.
 */
const props = withDefaults(
  defineProps<{ tone?: 'accent' | 'warning' | 'success' }>(),
  { tone: 'accent' },
);

const TONES = {
  accent: 'bg-bg-accent text-accent',
  warning: 'bg-bg-warning text-text-warning',
  success: 'bg-bg-success text-text-success',
} as const;
</script>

<template>
  <span
    class="inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs
      font-semibold"
    :class="TONES[props.tone]"
    ><slot
  /></span>
</template>
