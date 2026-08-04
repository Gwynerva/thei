<script lang="ts" setup>
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { enUS, ru } from 'date-fns/locale';
import type { DateRange } from '#layers/thei/shared/date-range';
import {
  timeFromDateRangeValue,
  toDateString,
  toPickerDate,
} from '#layers/thei/shared/date-range';

const model = defineModel<DateRange | undefined>();

const calendarValue = ref<[Date | null, Date | null] | null>(null);
const includeStartTime = ref(false);
const includeEndTime = ref(false);
const startTime = ref('00:00');
const endTime = ref('00:00');
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
      includeStartTime.value = false;
      includeEndTime.value = false;
      startTime.value = '00:00';
      endTime.value = '00:00';
      return;
    }
    calendarValue.value = [
      toPickerDate(range.startDate),
      toPickerDate(range.endDate),
    ];
    includeStartTime.value = range.startDate.includes('T');
    includeEndTime.value = range.endDate.includes('T');
    startTime.value = timeFromDateRangeValue(range.startDate);
    endTime.value = timeFromDateRangeValue(range.endDate);
  },
  { immediate: true },
);

watch(
  [calendarValue, includeStartTime, includeEndTime, startTime, endTime],
  ([value]) => {
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

function updateBoundaryTime(boundary: 'start' | 'end', value: string) {
  if (boundary === 'end') {
    endTime.value = value;
    return;
  }
  startTime.value = value;
  if (
    includeEndTime.value &&
    canCompareBoundaryTimes() &&
    startTime.value > endTime.value
  )
    endTime.value = startTime.value;
}

function canCompareBoundaryTimes() {
  const value = calendarValue.value;
  return (
    !value ||
    !(value[0] instanceof Date) ||
    !(value[1] instanceof Date) ||
    toDateString(value[0]) === toDateString(value[1])
  );
}

function dateTime(value: Date, time: string) {
  return `${toDateString(value)}T${time}`;
}

function rangeFromCalendar(value: unknown): DateRange | undefined {
  if (
    !Array.isArray(value) ||
    !(value[0] instanceof Date) ||
    !(value[1] instanceof Date)
  )
    return undefined;
  return {
    startDate: includeStartTime.value
      ? dateTime(value[0], startTime.value)
      : toDateString(value[0]),
    endDate: includeEndTime.value
      ? dateTime(value[1], endTime.value)
      : toDateString(value[1]),
  };
}

function formatDate(value: string) {
  const hasTime = value.includes('T');
  return new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(hasTime
      ? {
          hour: '2-digit' as const,
          minute: '2-digit' as const,
          hourCycle: 'h23' as const,
        }
      : {}),
  }).format(new Date(hasTime ? value : `${value}T00:00`));
}

function formatRange(value: unknown) {
  const range = rangeFromCalendar(value);
  return (
    range && `${formatDate(range.startDate)} — ${formatDate(range.endDate)}`
  );
}
</script>

<template>
  <VueDatePicker
    v-model="calendarValue"
    class="field-date-range-picker block w-full"
    range
    inline
    :time-config="{ enableTimePicker: false }"
    :locale="calendarLocale"
    :dark="calendarIsDark"
    :teleport="false"
  >
    <template #action-buttons="{ value }">
      <div
        class="flex w-full min-w-0 flex-col gap-sm whitespace-normal sm:flex-row
          sm:items-end"
      >
        <div class="flex min-w-0 flex-wrap items-end gap-xs">
          <FieldToggle v-model="includeStartTime">{{
            phrase.date_range_start
          }}</FieldToggle>
          <Field v-if="includeStartTime" class="w-28">
            <FieldInput
              v-model="startTime"
              type="time"
              class="bg-transparent"
              @update:model-value="updateBoundaryTime('start', $event ?? '')"
            />
          </Field>
        </div>
        <div class="flex min-w-0 flex-wrap items-end gap-xs">
          <FieldToggle v-model="includeEndTime">{{
            phrase.date_range_end
          }}</FieldToggle>
          <Field v-if="includeEndTime" class="w-28">
            <FieldInput
              v-model="endTime"
              type="time"
              class="bg-transparent"
              @update:model-value="updateBoundaryTime('end', $event ?? '')"
            />
          </Field>
        </div>
        <span
          class="min-w-0 flex-1 truncate rounded-normal bg-bg-3 px-xs py-1
            text-xs text-text-1"
        >
          {{ formatRange(value) }}
        </span>
      </div>
    </template>
  </VueDatePicker>
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
