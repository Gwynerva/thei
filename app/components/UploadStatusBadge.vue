<script lang="ts" setup>
import type { UploadStatus } from '#layers/thei/app/composables/upload-progress';

/**
 * A round badge over a file on its way: a ring filling with the share done
 * while there is one, a spinner while there is not, a warning once it has
 * failed. It never puts words on the picture — what is going on is a hint,
 * and the parent keeps the same words in a `role="status"` for a reader.
 */
const props = defineProps<{
  status: UploadStatus | null;
  error?: string;
  /** What the hint says: the failure, or where the file is. */
  label: string;
  large?: boolean;
}>();

const progress = computed(() =>
  props.error ? undefined : props.status?.progress,
);
</script>

<template>
  <span
    data-drag-ignore
    :data-title-popup="label"
    class="pointer-events-auto flex items-center justify-center rounded-full
      bg-bg-1/85 shadow backdrop-blur-sm"
    :class="[
      large ? 'size-12 text-2xl' : 'size-8 text-base',
      error ? 'text-text-error' : 'text-accent',
    ]"
    aria-hidden="true"
  >
    <Icon v-if="error" name="warning" />
    <svg
      v-else-if="progress !== undefined"
      viewBox="0 0 36 36"
      class="-rotate-90"
      :class="large ? 'size-7' : 'size-5'"
    >
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        class="opacity-20"
      />
      <circle
        cx="18"
        cy="18"
        r="15"
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray="100"
        :stroke-dashoffset="100 - Math.round(progress * 100)"
        class="transition-all duration-200 motion-reduce:transition-none"
      />
    </svg>
    <Icon v-else name="loading" />
  </span>
</template>
