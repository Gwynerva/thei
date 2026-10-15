<script lang="ts" setup>
/** Words an edit takes out, struck through, or puts in, marked as new. */
defineProps<{ kind: 'removed' | 'added' }>();
</script>

<template>
  <del
    v-if="kind === 'removed'"
    class="rounded-xs bg-bg-error px-0.5 text-text-error line-through"
    ><slot
  /></del>
  <ins
    v-else
    class="rounded-xs bg-bg-success px-0.5 text-text-success no-underline"
    ><slot
  /></ins>
</template>
