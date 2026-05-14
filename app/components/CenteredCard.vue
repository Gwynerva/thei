<script lang="ts" setup>
const props = withDefaults(defineProps<{ maxWidth?: 'sm' | 'md' }>(), {
  maxWidth: 'sm',
});

const maxWidthClass = computed(() =>
  props.maxWidth === 'md' ? 'sm:max-w-md' : 'sm:max-w-sm',
);
</script>

<template>
  <div class="flex min-h-screen items-center justify-center sm:p-4">
    <div
      class="flex min-h-screen w-full items-center justify-center bg-white p-8
        sm:min-h-auto sm:rounded-2xl sm:shadow-lg dark:bg-gray-900"
      :class="maxWidthClass"
    >
      <slot />
    </div>
  </div>
</template>
