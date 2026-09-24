<script lang="ts" setup>
import type { Placement } from '@floating-ui/vue';
import type { DateRange } from '#layers/thei/shared/date-range';

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
const anchor = useTemplateRef<HTMLElement>('anchor');
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
    <button
      ref="anchor"
      type="button"
      data-label-focus
      class="flex w-full min-w-40 flex-1 cursor-pointer items-center gap-xs
        rounded-normal border-2 border-border-1 bg-bg-1 p-xs text-left
        text-text-1 transition hocus:border-border-3"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    >
      <Icon name="calendar" class="shrink-0" />
      <span :class="model ? undefined : 'text-text-3'">
        {{ model || label }}
      </span>
    </button>
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
