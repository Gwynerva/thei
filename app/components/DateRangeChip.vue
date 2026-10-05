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
import type { Period } from '#layers/thei/shared/period';
import { formatPublicPeriodAtPrecision } from '#layers/thei/shared/public-date-format';

const props = withDefaults(
  defineProps<{
    period: DateRange | DatedPeriod | Period;
    removable?: boolean;
    /** Turns the label into a button that asks to reopen the picker. */
    editable?: boolean;
    href?: string;
  }>(),
  { removable: false, editable: false },
);
const emit = defineEmits<{ remove: []; edit: [] }>();

/**
 * The days, months abbreviated and what both ends share said once — or the
 * months or the year, when that is all the owner knows.
 */
const dates = computed(() =>
  formatPublicPeriodAtPrecision(
    props.period as DatedPeriod,
    language.value.code,
    'abbreviated',
  ),
);
/** The owner's name for the period, read before its dates. */
const name = computed(() =>
  'label' in props.period && props.period.label
    ? publicText(props.period.label)
    : '',
);
const label = computed(() =>
  name.value ? `${name.value}, ${dates.value}` : dates.value,
);
/**
 * A chip that does nothing when pressed — in a row the whole of which opens
 * something — wears the raised look the others take under the pointer, so it
 * stands off whatever it lies on; its ground lets a picture beneath tint it.
 */
const interactive = computed(
  () => Boolean(props.href) || props.removable || props.editable,
);

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
          publicText,
        ),
      )
    : undefined,
);

/**
 * The dates are pale in every chip, under the period's name or alone, exact
 * or about a day: only a month or a year that is a guess colours them, and
 * the "about" mark says the rest.
 */
const toneClass = computed(() => {
  switch (datePrecisionTone(precision.value)) {
    case 'neutral':
      return '';
    case 'warning':
      return 'text-text-warning';
    case 'alert':
      return 'text-text-error';
  }
});
</script>

<template>
  <!-- Two lines, as the chronology shows a period: its name, then its dates.
       A period without a name is its dates alone, in the name's place; the
       chips of one row share a height, so it sits in the middle of it. -->
  <component
    :is="href && !removable ? 'a' : 'span'"
    :href="href && !removable ? href : undefined"
    class="inline-flex max-w-full items-center gap-1 rounded-normal py-1 text-xs
      leading-tight no-underline"
    :class="[
      removable ? 'pr-1 pl-xs' : 'px-xs',
      interactive
        ? `bg-bg-3 transition focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none hocus:bg-bg-4`
        : 'bg-bg-4/75',
    ]"
    data-date-range-chip
  >
    <component
      :is="editable ? 'button' : 'span'"
      :type="editable ? 'button' : undefined"
      class="flex min-w-0 flex-col items-start text-left"
      :class="editable ? 'cursor-pointer' : ''"
      :aria-label="editable ? `${phrase.edit}: ${label}` : undefined"
      @click="editable ? emit('edit') : undefined"
    >
      <span v-if="name" class="max-w-full truncate text-text-1">
        {{ name }}
      </span>
      <span class="inline-flex max-w-full items-center gap-1 text-text-2">
        <Icon
          v-if="approximate"
          name="approximate"
          class="shrink-0"
          :class="toneClass"
          v-bind="approximateTitle"
        />
        <span class="truncate" :class="toneClass">{{ dates }}</span>
      </span>
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
