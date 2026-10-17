<script lang="ts" setup>
/**
 * A count in a small round mark: how many wait, beside a ✦ or a session, in
 * the accent; how many there are of something quieter, `neutral`. On the
 * admin bar's glass, which takes the page's own ground, it is drawn
 * `inverse`: in the reversed colours of a hint, so it stands out in either
 * theme.
 */
const props = withDefaults(
  defineProps<{ count: number; tone?: 'accent' | 'neutral' | 'inverse' }>(),
  { tone: 'accent' },
);

const TONES = {
  accent: 'bg-accent font-bold text-white dark:text-bg-1',
  neutral: 'bg-bg-3 font-semibold text-text-2',
  inverse: 'bg-bw-reverse font-bold text-bw',
} as const;
</script>

<template>
  <span
    class="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full
      px-1 text-2xs tabular-nums"
    :class="TONES[props.tone]"
    >{{ count }}</span
  >
</template>
