<script lang="ts" setup>
import {
  EXACT_DATE_PRECISION,
  type DatedPeriod,
} from '#layers/thei/shared/date-precision';
import { normalizeStagePeriods } from '#layers/thei/shared/project-content-item';
import DateRangeChip from '#layers/thei/app/components/DateRangeChip.vue';
import FieldDateRangePopup from '#layers/thei/app/components/field/FieldDateRangePopup.vue';

const model = defineModel<DatedPeriod[]>({ required: true });
const popupOpen = ref(false);
const anchor = useTemplateRef<HTMLElement>('anchor');

/**
 * The period being composed. It is committed on a click rather than the
 * moment a date is picked, because certainty is chosen after the dates and
 * closing the popup underneath the person would take that away.
 */
const pending = ref<DatedPeriod>();
const editedIndex = ref<number>();

function open(index?: number) {
  editedIndex.value = index;
  pending.value =
    index === undefined
      ? undefined
      : { ...(model.value[index] as DatedPeriod) };
  popupOpen.value = true;
}

function confirm() {
  const period = pending.value;
  if (!period) return;
  const rest =
    editedIndex.value === undefined
      ? model.value
      : model.value.filter((_, index) => index !== editedIndex.value);
  model.value = normalizeStagePeriods([...rest, period]);
  pending.value = undefined;
  editedIndex.value = undefined;
  popupOpen.value = false;
}

watch(popupOpen, (isOpen) => {
  if (isOpen) return;
  pending.value = undefined;
  editedIndex.value = undefined;
});

function remove(index: number) {
  model.value = model.value.filter((current, at) => at !== index);
}
</script>

<template>
  <div class="flex flex-col gap-xs">
    <div class="flex flex-wrap gap-xs">
      <DateRangeChip
        v-for="(period, index) in model"
        :key="`${period.startDate}:${period.endDate}`"
        :period="period"
        removable
        editable
        @edit="open(index)"
        @remove="remove(index)"
      />
      <button
        ref="anchor"
        type="button"
        class="flex h-10 cursor-pointer items-center gap-xs rounded-normal
          bg-bg-3 px-sm text-sm text-text-2 transition hocus:bg-bg-accent
          hocus:text-accent"
        @click="popupOpen ? (popupOpen = false) : open()"
      >
        <Icon name="plus" />
        {{ phrase.add }}
      </button>
    </div>
    <FieldDateRangePopup
      v-model="pending"
      v-model:open="popupOpen"
      :anchor="anchor"
      placement="bottom-start"
      :confirm-label="editedIndex === undefined ? phrase.add : phrase.save"
      @confirm="confirm"
    />
  </div>
</template>
