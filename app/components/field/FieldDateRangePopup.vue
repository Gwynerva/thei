<script lang="ts" setup>
import type { Placement, ReferenceElement } from '@floating-ui/vue';
import type { DateRange } from '#layers/thei/shared/date-range';
import {
  normalizeDatePrecisionInfo,
  type DatedPeriod,
  type DatePrecision,
} from '#layers/thei/shared/date-precision';
import FloatingPopup from '#layers/thei/app/components/FloatingPopup.vue';
import FieldDateRangePicker from '#layers/thei/app/components/field/FieldDateRangePicker.vue';
import FieldPrecisionBar from '#layers/thei/app/components/field/FieldPrecisionBar.vue';

withDefaults(
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
 * The calendar keeps owning the dates and nothing else. Certainty lives below
 * it, in this component's own markup, so `@vuepic/vue-datepicker` never has to
 * lay out anything it did not render — which is exactly where it used to fall
 * apart, on mobile above all.
 */
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

const precisionModel = computed<DatePrecision>({
  get: () => model.value?.precision ?? 'exact',
  set: (precision) => {
    if (!model.value) return;
    model.value = {
      ...model.value,
      ...normalizeDatePrecisionInfo({ ...model.value, precision }),
    };
  },
});

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
    <div class="flex max-w-80 flex-col">
      <FieldDateRangePicker v-model="range" :single :max-date />
      <div
        v-if="precision && model"
        class="flex flex-col gap-xs border-t border-border-1 p-sm"
      >
        <FieldLabel>{{ phrase.date_precision }}</FieldLabel>
        <FieldPrecisionBar v-model="precisionModel" />
        <FieldInput
          v-if="precisionModel !== 'exact'"
          v-model="noteModel"
          type="text"
          autocomplete="off"
          class="text-sm"
          :aria-label="phrase.date_precision_note"
          :placeholder="phrase.date_precision_note_placeholder"
        />
        <FieldHint>{{ phrase.date_precision_hint }}</FieldHint>
      </div>
      <div v-if="confirmLabel" class="border-t border-border-1 p-sm">
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
