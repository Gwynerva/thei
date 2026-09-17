<script lang="ts" setup>
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div
    class="flex flex-col items-center rounded-normal border border-dashed
      border-border-1 px-md py-lg text-center"
    data-empty-state
  >
    <Icon
      name="face-dead"
      class="mb-xs text-4xl text-text-3"
      aria-hidden="true"
    />
    <p class="font-semibold tracking-tight text-balance text-text-2">
      {{ title }}
    </p>
    <p
      v-if="description"
      class="mt-1 max-w-110 text-sm text-balance text-text-3"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.default"
      class="mt-md flex flex-wrap items-center justify-center gap-xs"
    >
      <slot />
    </div>
  </div>
</template>
