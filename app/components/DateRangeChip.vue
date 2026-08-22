<script lang="ts" setup>
import type { DateRange } from '#layers/thei/shared/date-range';

const props = withDefaults(
  defineProps<{
    period: DateRange;
    removable?: boolean;
  }>(),
  { removable: false },
);
const emit = defineEmits<{ remove: [] }>();

const formatter = computed(
  () =>
    new Intl.DateTimeFormat(language.value.code, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
);
const formatDate = (value: string) =>
  formatter.value.format(new Date(`${value}T00:00`));
const label = computed(() => {
  const startDate = formatDate(props.period.startDate);
  return props.period.startDate === props.period.endDate
    ? startDate
    : `${startDate} — ${formatDate(props.period.endDate)}`;
});
</script>

<template>
  <span
    class="inline-flex max-w-full items-center rounded-full bg-bg-3 py-1 text-xs
      text-text-2"
    :class="removable ? 'pr-1 pl-xs' : 'px-xs'"
  >
    <span class="truncate">{{ label }}</span>
    <button
      v-if="removable"
      type="button"
      class="flex size-6 shrink-0 cursor-pointer items-center justify-center
        rounded-full text-text-2 transition-colors hocus:bg-bg-error
        hocus:text-text-error"
      :aria-label="`${phrase.delete}: ${label}`"
      @click.stop="emit('remove')"
    >
      <Icon name="close" />
    </button>
  </span>
</template>
