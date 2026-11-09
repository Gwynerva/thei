<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue';
import type { Placement } from '@floating-ui/vue';
import type { DateRange } from '#layers/thei/shared/date-range';
import { formatAbsolutePublicDate } from '#layers/thei/shared/public-date-format';

const props = withDefaults(
  defineProps<{
    label: string;
    maxDate?: Date;
    placement?: Placement;
    /**
     * A date the value cannot be without: no clear button, and a popup
     * deselection leaves the current day in place.
     */
    required?: boolean;
  }>(),
  { placement: 'bottom-end' },
);

const model = defineModel<string>({ required: true });
const open = ref(false);
const anchorButton = useTemplateRef<ComponentPublicInstance>('anchor');
const anchor = computed(
  () => (anchorButton.value?.$el as HTMLElement | undefined) ?? null,
);
/** The day in words, «8 ноября 2026», never the stored `2026-11-08`. */
const text = computed(() =>
  model.value ? formatAbsolutePublicDate(model.value, language.value.code) : '',
);
const range = computed<DateRange | undefined>({
  get: () =>
    model.value ? { startDate: model.value, endDate: model.value } : undefined,
  set: (value) => {
    if (value?.startDate || !props.required)
      model.value = value?.startDate ?? '';
    open.value = false;
  },
});
</script>

<template>
  <div class="flex min-w-0 items-center gap-xs">
    <FieldDateButton
      ref="anchor"
      class="min-w-40 flex-1"
      :label="text ? `${label}: ${text}` : label"
      :text
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    />
    <Button
      v-if="model && !required"
      type="button"
      size="icon"
      variant="delete"
      :aria-label="phrase.delete"
      @click="model = ''"
    >
      <Icon name="delete" />
    </Button>
    <!-- One date has no certainty to choose: this value holds a day alone,
         and a doubt written into it would only close the popup. -->
    <FieldDateRangePopup
      v-model="range"
      v-model:open="open"
      :anchor
      :placement
      :max-date
      :precision="false"
      single
    />
  </div>
</template>
