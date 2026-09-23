<script lang="ts" setup>
import type { IconName } from '#thei/icons';

defineProps<{
  icon: IconName;
  label: string;
  readOnly?: boolean;
  /** Files are on their way — pasted, and being stored as they are. */
  loading?: boolean;
}>();

const emit = defineEmits<{
  pick: [];
}>();
</script>

<template>
  <button
    type="button"
    data-drag-ignore
    class="group flex h-34 w-full items-center justify-center overflow-hidden
      rounded-normal bg-bg-accent text-accent/45 transition-colors outline-none
      hocus:bg-accent/20 hocus:text-accent"
    :disabled="readOnly || loading"
    :aria-label="label"
    :aria-busy="loading"
    @click="emit('pick')"
  >
    <Icon
      :name="loading ? 'loading' : icon"
      class="text-6xl transition-colors"
      aria-hidden="true"
    />
  </button>
</template>
