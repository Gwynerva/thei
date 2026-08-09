<script lang="ts" setup>
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { enUS, ru } from 'date-fns/locale';
import type { DateRange } from '#layers/thei/shared/date-range';
import { toDateString, toPickerDate } from '#layers/thei/shared/date-range';

const model = defineModel<DateRange | undefined>();

const calendarValue = ref<[Date | null, Date | null] | null>(null);
const visuals = useVisuals();
const calendarLocale = computed(() =>
  language.value.code === 'ru' ? ru : enUS,
);
const calendarIsDark = computed(
  () =>
    visuals.value.theme === 'dark' ||
    (visuals.value.theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches),
);

watch(
  model,
  (range) => {
    if (!range) {
      calendarValue.value = null;
      return;
    }
    calendarValue.value = [
      toPickerDate(range.startDate),
      toPickerDate(range.endDate),
    ];
  },
  { immediate: true },
);

watch(
  calendarValue,
  (value) => {
    const range = rangeFromCalendar(value);
    if (
      !range ||
      (range.startDate === model.value?.startDate &&
        range.endDate === model.value?.endDate)
    )
      return;
    model.value = range;
  },
  { deep: true },
);

function rangeFromCalendar(value: unknown): DateRange | undefined {
  if (
    !Array.isArray(value) ||
    !(value[0] instanceof Date) ||
    !(value[1] instanceof Date)
  )
    return undefined;
  return {
    startDate: toDateString(value[0]),
    endDate: toDateString(value[1]),
  };
}
</script>

<template>
  <VueDatePicker
    v-model="calendarValue"
    class="field-date-range-picker block w-full"
    range
    inline
    auto-apply
    :time-config="{ enableTimePicker: false }"
    :locale="calendarLocale"
    :dark="calendarIsDark"
    :teleport="false"
  />
</template>

<style scoped>
.field-date-range-picker {
  /* Vue DatePicker consumes these theme variables internally. */
  --dp-background-color: var(--color-bg-2) !important;
  --dp-text-color: var(--color-text-1) !important;
  --dp-primary-color: var(--color-accent) !important;
  --dp-primary-text-color: var(--color-white) !important;
  --dp-secondary-color: var(--color-text-3) !important;
  --dp-border-color: var(--color-border-1) !important;
  --dp-menu-border-color: var(--color-border-1) !important;
  --dp-hover-color: var(--color-bg-3) !important;
  --dp-hover-text-color: var(--color-text-1) !important;
  --dp-icon-color: var(--color-text-2) !important;
  --dp-range-between-dates-background-color: var(--color-bg-accent) !important;
  --dp-range-between-dates-text-color: var(--color-text-1) !important;
  --dp-cell-border-radius: var(--radius-normal) !important;
  --dp-border-radius: var(--radius-normal) !important;
}
/* 
.field-date-range-picker :deep(.dp--outer-menu-wrap),
.field-date-range-picker :deep(.dp--menu),
.field-date-range-picker :deep(.dp--action-row),
.field-date-range-picker :deep(.dp--action-buttons) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.field-date-range-picker :deep(.dp--action-buttons) {
  flex: 1 1 auto;
  margin-inline-start: 0;
}

.field-date-range-picker :deep(.dp--outer-menu-wrap),
.field-date-range-picker :deep(.dp--menu) {
  flex: 1 1 auto;
}

.field-date-range-picker :deep(.dp--selection-preview) {
  display: none;
} */
</style>
