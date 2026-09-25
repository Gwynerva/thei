<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue';
import type { Placement, ReferenceElement } from '@floating-ui/vue';
import type { DateRange } from '#layers/thei/shared/date-range';
import {
  DATE_PRECISIONS,
  datePrecisionTone,
  normalizeDatePrecisionInfo,
  type DatedPeriod,
  type DatePrecision,
} from '#layers/thei/shared/date-precision';
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
const model = defineModel<DatedPeriod | undefined>();

/**
 * The dates first, then how sure they are, one after the other in the same
 * popup. `@vuepic/vue-datepicker` never shares its surface with anything it
 * did not render — that is where it kept falling apart — and certainty is a
 * separate question anyway. A period that already has dates opens straight
 * on its certainty; the dates are one click away from there.
 */
const step = ref<'dates' | 'certainty'>('dates');
const certaintyShown = computed(
  () => props.precision && step.value === 'certainty' && !!model.value,
);
const calendar =
  useTemplateRef<InstanceType<typeof FieldDateRangePicker>>('calendar');
const editButton = useTemplateRef<ComponentPublicInstance>('editButton');

watch(
  open,
  (isOpen) => {
    if (isOpen) step.value = model.value ? 'certainty' : 'dates';
  },
  { immediate: true },
);

async function onPicked() {
  if (!props.precision) return;
  step.value = 'certainty';
  await nextTick();
  (editButton.value?.$el as HTMLElement | undefined)?.focus({
    preventScroll: true,
  });
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
    // Changing the dates keeps whatever certainty was already chosen.
    model.value = { ...value, ...normalizeDatePrecisionInfo(model.value) };
  },
});

/** The chosen dates, with the months abbreviated so a period fits a line. */
const periodLabel = computed(() => {
  if (!model.value) return '';
  const utc = (date: string) => new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat(language.value.code, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .formatRange(utc(model.value.startDate), utc(model.value.endDate))
    .replaceAll(/\s+г\./g, '')
    .replaceAll(/\s+–\s+/g, ' — ')
    .trim();
});

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
      <template v-if="certaintyShown">
        <div
          class="flex items-center gap-xs border-b border-border-1 py-xs pr-xs
            pl-sm"
        >
          <span class="min-w-0 grow text-sm font-semibold">
            {{ periodLabel }}
          </span>
          <Button
            ref="editButton"
            type="button"
            size="icon-sm"
            variant="secondary"
            :aria-label="`${phrase.edit}: ${periodLabel}`"
            :data-title-popup="phrase.edit"
            @click="editDates"
          >
            <Icon name="edit" />
          </Button>
        </div>
        <div class="flex flex-col gap-md p-sm">
          <FieldDiscreteBar
            v-model="precisionModel"
            :stops="precisionStops"
            :label="phrase.date_precision"
            :icon="precisionModel === 'exact' ? undefined : 'approximate'"
          />
          <FieldTextarea
            v-if="precisionModel !== 'exact'"
            v-model="noteModel"
            class="text-xs"
            :aria-label="phrase.date_precision_note"
            :placeholder="phrase.date_precision_note_placeholder"
          />
        </div>
      </template>
      <FieldDateRangePicker
        v-else
        ref="calendar"
        v-model="range"
        :single
        :max-date
        @picked="onPicked"
      />
      <div
        v-if="confirmLabel && (certaintyShown || !precision)"
        class="border-t border-border-1 p-sm"
      >
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
