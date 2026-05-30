<script lang="ts" setup>
import type { PickTestResult } from './modal';
import type { ModalResultOf } from '#layers/thei/app/modals/types';

const props = defineProps<{
  modalData: { label: string; min: number; max: number };
}>();

const emit = defineEmits<{
  modalResult: [result: ModalResultOf<PickTestResult>];
}>();

const num = ref(props.modalData.min);

function pick() {
  emit('modalResult', { type: 'test', value: num.value });
}

function cancel() {
  emit('modalResult', { type: 'empty' });
}
</script>

<template>
  <div class="h-[3000px] bg-text-error">
    <p>{{ props.modalData.label }}</p>
    <input
      v-model.number="num"
      type="number"
      :min="props.modalData.min"
      :max="props.modalData.max"
    />
    <button @click="pick">Pick</button>
    <button @click="cancel">Cancel</button>
  </div>
</template>
