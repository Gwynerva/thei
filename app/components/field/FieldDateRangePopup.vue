<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue';
import type { Placement, ReferenceElement } from '@floating-ui/vue';
import type { DateRange } from '#layers/thei/shared/date-range';
import {
  DATE_PRECISIONS,
  datePrecisionTone,
  normalizeDatePrecisionInfo,
  type DatePrecision,
} from '#layers/thei/shared/date-precision';
import {
  PERIOD_LABEL_MAX_LENGTH,
  type Period,
} from '#layers/thei/shared/period';
import { formatPublicDateRange } from '#layers/thei/shared/public-date-format';
import FloatingPopup from '#layers/thei/app/components/FloatingPopup.vue';
import FieldDateRangePicker from '#layers/thei/app/components/field/FieldDateRangePicker.vue';
import FieldDiscreteBar from '#layers/thei/app/components/field/FieldDiscreteBar.vue';
import type { DiscreteBarStop } from '#layers/thei/app/components/field/discrete-bar-stops';

const props = withDefaults(
  defineProps<{
    anchor: ReferenceElement | null;
    placement?: Placement;
    teleportTo?: string | HTMLElement;
    single?: boolean;
    maxDate?: Date;
    /** Certainty is meaningless for a date the engine picks, such as a filter. */
    precision?: boolean;
    /** Lets the owner name the period, above its dates. */
    labelled?: boolean;
    /** Shown on the button that commits the period; omitted, there is none. */
    confirmLabel?: string;
  }>(),
  {
    placement: 'bottom-end',
    teleportTo: 'body',
    precision: true,
  },
);

const emit = defineEmits<{ confirm: [] }>();

const open = defineModel<boolean>('open', { required: true });
const model = defineModel<Period | undefined>();

/**
 * The dates first, then the rest of the period in the same popup: its name,
 * its dates and how sure they are, as the fields of one small form.
 * `@vuepic/vue-datepicker` never shares its surface with anything it did not
 * render — that is where it kept falling apart — so the calendar has a step
 * of its own. A period that already has dates opens straight on the rest;
 * the dates are one click away from there.
 */
const step = ref<'dates' | 'details'>('dates');
const hasDetails = computed(() => props.precision || props.labelled);
const detailsShown = computed(
  () => hasDetails.value && step.value === 'details' && !!model.value,
);
const calendar =
  useTemplateRef<InstanceType<typeof FieldDateRangePicker>>('calendar');
const datesButton = useTemplateRef<ComponentPublicInstance>('datesButton');
/** Handed over by the field once it renders, so it can take the focus. */
const labelInput = shallowRef<HTMLInputElement>();

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    step.value = model.value ? 'details' : 'dates';
  },
  { immediate: true },
);

async function onPicked() {
  if (!hasDetails.value) return;
  step.value = 'details';
  await nextTick();
  // The name is what is left to type; a touch screen would cover the popup
  // with its keyboard, so there the dates keep the focus until asked.
  const typing = props.labelled && window.matchMedia('(pointer: fine)').matches;
  const target = typing
    ? labelInput.value
    : (datesButton.value?.$el as HTMLElement | undefined);
  target?.focus({ preventScroll: true });
}

async function editDates() {
  step.value = 'dates';
  await nextTick();
  calendar.value?.focus();
}

const range = computed<DateRange | undefined>({
  get: () => model.value,
  set: (value) => {
    if (!value) {
      model.value = undefined;
      return;
    }
    // Changing the dates keeps whatever was already said about them.
    model.value = {
      ...value,
      ...normalizeDatePrecisionInfo(model.value),
      label: model.value?.label ?? '',
    };
  },
});

/** The chosen dates, with the months abbreviated so a period fits a line. */
const datesText = computed(() =>
  model.value
    ? formatPublicDateRange(model.value, language.value.code, 'abbreviated')
    : '',
);

const precisionModel = computed<string>({
  get: () => model.value?.precision ?? 'exact',
  set: (precision) => {
    if (!model.value) return;
    model.value = {
      ...model.value,
      ...normalizeDatePrecisionInfo({
        ...model.value,
        precision: precision as DatePrecision,
      }),
    };
  },
});

/** The colour the chronology gives doubtful dates, shown as it is chosen. */
const datesTone = computed(() => {
  switch (datePrecisionTone(precisionModel.value as DatePrecision)) {
    case 'warning':
      return 'text-text-warning';
    case 'alert':
      return 'text-text-error';
    default:
      return undefined;
  }
});

/**
 * How sure the owner is of a date, on a four-stop track. Each stop is named
 * in a word under the track; the full wording is in the header and on hover.
 */
const precisionStops = computed<DiscreteBarStop[]>(() =>
  DATE_PRECISIONS.map((precision) => {
    const label = phrase.value[`date_precision_${precision}`];
    return {
      value: precision,
      label,
      caption: phrase.value[`date_precision_${precision}_short`],
      title: label,
      tone: datePrecisionTone(precision),
    };
  }),
);

const noteModel = computed<string>({
  get: () => model.value?.precisionNote ?? '',
  set: (precisionNote) => {
    if (!model.value) return;
    model.value = { ...model.value, precisionNote };
  },
});

/** Bound as typed: the name is formatted where it is shown, never here. */
const labelModel = computed<string>({
  get: () => model.value?.label ?? '',
  set: (label) => {
    if (!model.value) return;
    model.value = { ...model.value, label };
  },
});

function confirmFromLabel(event: KeyboardEvent) {
  if (event.isComposing || !model.value || !props.confirmLabel) return;
  event.preventDefault();
  emit('confirm');
}
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="anchor"
    :placement="placement"
    :teleport-to="teleportTo"
    fit-content
  >
    <!-- Both steps share one width, so the popup keeps its place when it
         turns from one to the other. -->
    <div
      class="flex scrollbar-mini max-h-(--floating-popup-available-height) w-76
        max-w-full flex-col overflow-y-auto overscroll-contain rounded-normal
        border border-border-1 bg-bg-2"
    >
      <div v-if="detailsShown && model" class="flex flex-col gap-sm p-sm">
        <!-- Each field says what it is in its placeholder, so the form stays
             as small as the popup it sits in. -->
        <FieldInput
          v-if="labelled"
          v-model="labelModel"
          class="text-sm"
          autocomplete="off"
          :maxlength="PERIOD_LABEL_MAX_LENGTH"
          :aria-label="phrase.period_label"
          :placeholder="phrase.period_label_placeholder"
          @element="labelInput = $event"
          @keydown.enter="confirmFromLabel"
        />
        <FieldDateButton
          ref="datesButton"
          class="text-sm"
          :label="`${phrase.period_dates_edit}: ${datesText}`"
          :text="datesText"
          :icon="precisionModel === 'exact' ? 'calendar' : 'approximate'"
          :tone="datesTone"
          @click="editDates"
        />
        <template v-if="precision">
          <FieldDiscreteBar
            v-model="precisionModel"
            :stops="precisionStops"
            :label="phrase.date_precision"
            :icon="precisionModel === 'exact' ? undefined : 'approximate'"
          />
          <FieldTextarea
            v-if="precisionModel !== 'exact'"
            v-model="noteModel"
            class="text-sm"
            :aria-label="phrase.date_precision_note"
            :placeholder="phrase.date_precision_note"
          />
        </template>
        <Button v-if="confirmLabel" type="button" @click="emit('confirm')">
          <Icon name="check" />
          {{ confirmLabel }}
        </Button>
      </div>
      <!-- A single day is a period picked twice on the same date. -->
      <FieldDateRangePicker
        v-else
        ref="calendar"
        v-model="range"
        :single
        :max-date
        @picked="onPicked"
      />
      <div v-if="confirmLabel && !hasDetails" class="p-sm pt-0">
        <Button
          type="button"
          class="w-full"
          :disabled="!model"
          @click="emit('confirm')"
        >
          <Icon name="check" />
          {{ confirmLabel }}
        </Button>
      </div>
    </div>
  </FloatingPopup>
</template>
