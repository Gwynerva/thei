<script setup lang="ts">
const props = defineProps<{ timestamp: number; short?: boolean }>();
const now = useLiveNow();
const date = computed(() =>
  new Date(props.timestamp).toISOString().slice(0, 10),
);
const presentation = computed(() =>
  getPublicDatePresentation(
    date.value,
    language.value.code,
    new Date(now.value),
    { relativeMonths: 3, style: props.short ? 'short' : 'long' },
  ),
);
</script>
<template>
  <time
    :datetime="new Date(timestamp).toISOString()"
    v-bind="titlePopup(...(presentation.title ?? []))"
    class="text-xs text-text-3"
    >{{ presentation.label }}</time
  >
</template>
