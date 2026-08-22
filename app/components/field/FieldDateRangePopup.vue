<script lang="ts" setup>
import type { Placement, ReferenceElement } from '@floating-ui/vue';
import type { DateRange } from '#layers/thei/shared/date-range';
import FloatingPopup from '#layers/thei/app/components/FloatingPopup.vue';
import FieldDateRangePicker from '#layers/thei/app/components/field/FieldDateRangePicker.vue';

withDefaults(
  defineProps<{
    anchor: ReferenceElement | null;
    placement?: Placement;
    teleportTo?: string | HTMLElement;
  }>(),
  {
    placement: 'bottom-end',
    teleportTo: 'body',
  },
);

const open = defineModel<boolean>('open', { required: true });
const model = defineModel<DateRange | undefined>();
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="anchor"
    :placement="placement"
    :teleport-to="teleportTo"
    fit-content
  >
    <FieldDateRangePicker v-model="model" />
  </FloatingPopup>
</template>
