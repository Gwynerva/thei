<script lang="ts" setup>
/**
 * How many wait, in a small round mark beside a ✦ or a session. On the
 * admin bar's dark glass it is drawn inverse.
 */
const props = withDefaults(
  defineProps<{ count: number; tone?: 'accent' | 'inverse' }>(),
  { tone: 'accent' },
);
</script>

<template>
  <span
    class="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full
      px-1 text-2xs font-bold"
    :class="
      props.tone === 'inverse'
        ? 'bg-white text-black'
        : 'bg-accent text-white dark:text-bg-1'
    "
    >{{ count }}</span
  >
</template>
