<script setup lang="ts">
import FormField from '../FormField.vue';
import FormFieldHint from '../FormFieldHint.vue';
import FormFieldLabel from '../FormFieldLabel.vue';
import { useInstallPhrases } from '../../../install-language';

const emit = defineEmits<{
  change: [value: string];
}>();

const {
  install_display_name_label,
  install_display_name_variants,
  install_display_name_description,
} = useInstallPhrases();

const inputElement = useTemplateRef('input');

const displayName = ref('');

const sampleNicknames = [
  'Gwynerva',
  'Destroyer',
  'TheMastermind',
  'TheConqueror',
  'TheGreat',
];

const sampleName = computed(() => {
  const samplePool = install_display_name_variants.value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  samplePool.push(...sampleNicknames);

  return samplePool[Math.floor(Math.random() * samplePool.length)]!;
});

watch(displayName, (val) => emit('change', val));
</script>

<template>
  <FormField>
    <FormFieldLabel :focus="inputElement">
      {{ install_display_name_label }}
    </FormFieldLabel>
    <input
      ref="input"
      v-model="displayName"
      type="text"
      autocomplete="name"
      spellcheck="false"
      :placeholder="sampleName"
      class="hactive:border-blue-500 hactive:ring-1 hactive:ring-blue-500
        hactive:outline-none w-full rounded-lg border border-gray-300 bg-white
        px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-600
        dark:bg-gray-800 dark:text-gray-100"
    />
    <FormFieldHint>
      {{ install_display_name_description(displayName || sampleName) }}
    </FormFieldHint>
  </FormField>
</template>
