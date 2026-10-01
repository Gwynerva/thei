<script setup lang="ts">
/** A history's day, `YYYY-MM-DD`, told relative to today when it is recent. */
const props = defineProps<{ date: string; short?: boolean }>();
const now = useLiveNow();
const presentation = computed(() =>
  getPublicDatePresentation(
    props.date,
    language.value.code,
    new Date(now.value),
    { relativeMonths: 3, style: props.short ? 'short' : 'long' },
  ),
);
</script>
<template>
  <time
    :datetime="date"
    v-bind="titlePopup(...(presentation.title ?? []))"
    class="text-xs text-text-3"
    >{{ presentation.label }}</time
  >
</template>
