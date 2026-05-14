<script lang="ts" setup>
defineProps<{
  title: string;
  hint?: string;
  error?: string;
  labelFor?: boolean;
}>();

const id = useId();
</script>

<template>
  <div>
    <label
      :for="labelFor === false ? undefined : id"
      class="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300"
    >
      {{ title }}
    </label>
    <slot :id="id" />
    <p v-if="error" class="mt-2 text-xs text-red-500 dark:text-red-400">
      {{ error }}
    </p>
    <p v-else-if="hint" class="mt-2 text-xs text-gray-400 dark:text-gray-500">
      {{ hint }}
    </p>
  </div>
</template>
