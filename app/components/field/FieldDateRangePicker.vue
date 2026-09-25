<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { enUS, ru } from 'date-fns/locale';
import type { DateRange } from '#layers/thei/shared/date-range';
import { toDateString, toPickerDate } from '#layers/thei/shared/date-range';

const model = defineModel<DateRange | undefined>();
const props = defineProps<{ single?: boolean; maxDate?: Date }>();
/**
 * A date or a whole period has been picked by hand — also when it is the one
 * already chosen, which leaves the model as it was.
 */
const emit = defineEmits<{ picked: [] }>();

type CalendarValue = Date | Date[] | null;

const calendarValue = ref<CalendarValue>(null);
const calendarLocale = computed(() =>
  language.value.code === 'ru' ? ru : enUS,
);
const picker = useTemplateRef<ComponentPublicInstance>('picker');

watch(
  model,
  (range) => {
    if (!range) {
      calendarValue.value = null;
      return;
    }
    calendarValue.value = props.single
      ? toPickerDate(range.startDate)
      : [toPickerDate(range.startDate), toPickerDate(range.endDate)];
  },
  { immediate: true },
);

/** Only the calendar's own updates land here, never the model's echo. */
function onCalendarUpdate(value: CalendarValue) {
  calendarValue.value = value;
  const range = rangeFromCalendar(value);
  if (!range) return;
  if (
    range.startDate !== model.value?.startDate ||
    range.endDate !== model.value?.endDate
  )
    model.value = range;
  emit('picked');
}

/** Hands the keyboard to the calendar, as when it comes back into view. */
function focus() {
  const element: unknown = picker.value?.$el;
  if (!(element instanceof HTMLElement)) return;
  element
    .querySelector<HTMLElement>('[tabindex="0"]')
    ?.focus({ preventScroll: true });
}

defineExpose({ focus });

function rangeFromCalendar(value: unknown): DateRange | undefined {
  if (props.single && value instanceof Date)
    return { startDate: toDateString(value), endDate: toDateString(value) };
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
  <!-- Every month shows six weeks, so leafing through them never changes
       the height of the popup around the calendar. -->
  <VueDatePicker
    ref="picker"
    :model-value="calendarValue"
    class="field-date-range-picker"
    :range="!single"
    inline
    auto-apply
    six-weeks
    :time-config="{ enableTimePicker: false }"
    :locale="calendarLocale"
    :max-date="maxDate"
    :teleport="false"
    @update:model-value="onCalendarUpdate"
  />
</template>

<style scoped>
/*
 * Vue DatePicker consumes these theme variables internally. Its theme class
 * sits on the menu as well as on the root and declares its own palette there,
 * so the variables are declared on the menu too. The colours and the font
 * come from the site's own tokens, which follow the visitor's theme by
 * themselves, so the picker's own dark mode is never switched on.
 */
.field-date-range-picker,
.field-date-range-picker :deep(.dp--menu) {
  --dp-font-family: var(--font-default);
  --dp-cell-size: 2.5rem;
  --dp-border-radius: var(--radius-normal);
  --dp-cell-border-radius: var(--radius-normal);

  --dp-background-color: var(--color-bg-2);
  --dp-text-color: var(--color-text-1);
  --dp-hover-color: var(--color-bg-3);
  --dp-hover-text-color: var(--color-text-1);
  --dp-hover-icon-color: var(--color-text-1);
  --dp-icon-color: var(--color-text-2);
  --dp-primary-color: var(--color-accent);
  --dp-primary-disabled-color: var(--color-bg-accent);
  --dp-primary-text-color: var(--color-white);
  --dp-secondary-color: var(--color-text-3);
  --dp-disabled-color: var(--color-bg-3);
  --dp-disabled-color-text: var(--color-text-3);
  --dp-highlight-color: var(--color-bg-accent);
  --dp-range-between-dates-background-color: var(--color-bg-accent);
  --dp-range-between-dates-text-color: var(--color-text-1);
  --dp-range-between-border-color: var(--color-bg-accent);
  --dp-border-color: var(--color-border-1);
  --dp-border-color-hover: var(--color-border-3);
  --dp-border-color-focus: var(--color-border-3);
  /* The popup around the calendar draws the frame. */
  --dp-menu-border-color: transparent;
  --dp-success-color: var(--color-accent);
  --dp-success-color-disabled: var(--color-bg-accent);
  --dp-danger-color: var(--color-text-error);
  --dp-marker-color: var(--color-text-error);
  --dp-tooltip-color: var(--color-bg-2);
  --dp-scroll-bar-background: var(--color-bg-2);
  --dp-scroll-bar-color: var(--color-border-2);
}

/* The calendar fills the width of the popup it sits in. */
.field-date-range-picker :deep(.dp--outer-menu-wrap) {
  flex-grow: 1;
}
</style>
