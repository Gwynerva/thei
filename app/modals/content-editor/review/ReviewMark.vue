<script lang="ts" setup>
/**
 * Words an edit takes out, struck through, or puts in, marked as new — or
 * words a remark points at, which stay.
 */
defineProps<{ kind: 'removed' | 'added' | 'noted' }>();
</script>

<template>
  <del
    v-if="kind === 'removed'"
    class="rounded-xs bg-bg-error px-0.5 text-text-error line-through"
    ><slot
  /></del>
  <mark
    v-else-if="kind === 'noted'"
    class="rounded-xs bg-bg-warning px-0.5 text-text-warning"
    ><slot
  /></mark>
  <ins
    v-else
    class="rounded-xs bg-bg-success px-0.5 text-text-success no-underline"
    ><slot
  /></ins>
</template>
