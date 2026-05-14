<script lang="ts" setup>
import type { ShallowRef } from 'vue';

defineProps<{
  options: Record<string, string>;
}>();

const model = defineModel<string>();

const emit = defineEmits<{
  element: [HTMLSelectElement];
}>();

const selectElement = useTemplateRef('select');

watch(selectElement, (newElement) => {
  if (!newElement) {
    return;
  }

  emit('element', newElement);
});
</script>

<template>
  <div>
    <div
      class="group relative inline-block rounded-lg border-2 border-border-1
        bg-bg-1 transition hactive:border-border-3"
    >
      <select
        ref="select"
        v-model="model"
        class="cursor-pointer appearance-none bg-transparent py-2 pr-9 pl-sm
          text-sm"
      >
        <option
          v-for="(label, value) in options"
          :key="value"
          :value="value"
          class="bg-bg-1 checked:bg-accent checked:text-white"
        >
          {{ label }}
        </option>
      </select>

      <Icon
        name="chevron-right"
        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2
          rotate-90 text-text-3 transition group-hactive:text-text-1"
      />
    </div>
  </div>
</template>
