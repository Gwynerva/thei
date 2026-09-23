<script lang="ts" setup>
import type { DateRange } from '#layers/thei/shared/date-range';
import {
  datePrecisionTone,
  type DatedPeriod,
} from '#layers/thei/shared/date-precision';
import {
  approximateDateTitle,
  publicDatePrecisionLabels,
} from '#layers/thei/app/composables/public-date';
import { titlePopup } from '#layers/thei/app/composables/title-popup-content';

const props = withDefaults(
  defineProps<{
    period: DateRange | DatedPeriod;
    removable?: boolean;
    /** Turns the label into a button that asks to reopen the picker. */
    editable?: boolean;
    href?: string;
  }>(),
  { removable: false, editable: false },
);
const emit = defineEmits<{ remove: []; edit: [] }>();

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

const precision = computed(() =>
  'precision' in props.period ? props.period.precision : 'exact',
);
const note = computed(() =>
  'precisionNote' in props.period ? props.period.precisionNote : '',
);
const approximate = computed(() => precision.value !== 'exact');

/** The doubt, spelled out: its level, then the owner's own words for it. */
const approximateTitle = computed(() =>
  approximate.value
    ? titlePopup(
        ...approximateDateTitle(
          precision.value,
          note.value,
          publicDatePrecisionLabels(),
        ),
      )
    : undefined,
);

const toneClass = computed(() => {
  switch (datePrecisionTone(precision.value)) {
    case 'neutral':
      return approximate.value ? 'text-text-2' : '';
    case 'warning':
      return 'text-text-warning';
    case 'alert':
      return 'text-text-error';
  }
});
</script>

<template>
  <component
    :is="href && !removable ? 'a' : 'span'"
    :href="href && !removable ? href : undefined"
    class="inline-flex max-w-full items-center rounded-full bg-bg-3 py-1 text-xs
      text-text-2 no-underline transition focus-visible:ring-2
      focus-visible:ring-accent focus-visible:outline-none hocus:bg-bg-4
      hocus:text-text-1"
    :class="removable ? 'pr-1 pl-xs' : 'px-xs'"
  >
    <component
      :is="editable ? 'button' : 'span'"
      :type="editable ? 'button' : undefined"
      class="inline-flex min-w-0 items-center gap-1"
      :class="editable ? 'cursor-pointer' : ''"
      :aria-label="editable ? `${phrase.edit}: ${label}` : undefined"
      @click="editable ? emit('edit') : undefined"
    >
      <Icon
        v-if="approximate"
        name="approximate"
        class="shrink-0"
        :class="toneClass"
        v-bind="approximateTitle"
      />
      <span class="truncate" :class="toneClass">{{ label }}</span>
    </component>
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
  </component>
</template>
