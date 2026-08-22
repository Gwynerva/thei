<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

const { size = 'sm', disabled = false } = defineProps<{
  options: Record<string, string>;
  size?: 'xs' | 'sm';
  disabled?: boolean;
  wrapperClass?: string;
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
  <div :class="wrapperClass">
    <div
      class="group relative inline-flex h-full rounded-normal border-2
        border-border-1 bg-bg-1 transition has-focus:border-border-3
        has-hocus:border-border-3"
    >
      <select
        v-bind="attrs"
        ref="select"
        v-model="model"
        :disabled="disabled"
        data-label-focus
        class="h-full cursor-pointer appearance-none bg-transparent py-2 pr-10
          pl-xs disabled:cursor-not-allowed disabled:opacity-55"
        :class="size === 'xs' ? 'text-xs' : 'text-sm'"
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
          rotate-90 text-text-3 transition group-hocus:text-text-1"
      />
    </div>
  </div>
</template>
