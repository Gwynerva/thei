<script lang="ts" setup>
import type { DateRange } from '#layers/thei/shared/date-range';
import { normalizeStagePeriods } from '#layers/thei/shared/project-content-item';
import DateRangeChip from '#layers/thei/app/components/DateRangeChip.vue';
import FieldDateRangePopup from '#layers/thei/app/components/field/FieldDateRangePopup.vue';

const model = defineModel<DateRange[]>({ required: true });
const popupOpen = ref(false);
const anchor = useTemplateRef<HTMLElement>('anchor');
const pending = ref<DateRange>();

watch(pending, (period) => {
  if (!period) return;
  model.value = normalizeStagePeriods([...model.value, period]);
  pending.value = undefined;
  popupOpen.value = false;
});

function remove(index: number) {
  model.value = model.value.filter((_, current) => current !== index);
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
        @remove="remove(index)"
      />
      <button
        ref="anchor"
        type="button"
        class="flex h-10 cursor-pointer items-center gap-xs rounded-normal
          bg-bg-3 px-sm text-sm text-text-2 transition hocus:bg-bg-accent
          hocus:text-accent"
        @click="popupOpen = !popupOpen"
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
    />
  </div>
</template>
