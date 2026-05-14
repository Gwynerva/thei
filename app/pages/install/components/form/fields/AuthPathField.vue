<script setup lang="ts">
import FormField from '../FormField.vue';
import FormFieldHint from '../FormFieldHint.vue';
import FormFieldLabel from '../FormFieldLabel.vue';
import { useInstallPhrases } from '../../../install-language';

const emit = defineEmits<{
  change: [value: string];
}>();

const {
  install_auth_path_label,
  install_auth_path_prefix,
  install_auth_path_placeholder,
  install_auth_path_description,
} = useInstallPhrases();

const inputElement = useTemplateRef('input');

const authUrl = ref('');

watch(authUrl, (val) => emit('change', val));
</script>

<template>
  <FormField>
    <FormFieldLabel :focus="inputElement">
      {{ install_auth_path_label }}
    </FormFieldLabel>
    <div
      class="flex overflow-hidden rounded-lg border border-gray-300 shadow-sm
        focus-within:border-blue-500 focus-within:ring-1
        focus-within:ring-blue-500 dark:border-gray-600"
    >
      <span
        class="flex items-center border-r border-gray-300 bg-gray-100 px-3
          text-sm whitespace-nowrap text-gray-500 select-none
          dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400"
      >
        {{ install_auth_path_prefix }}
      </span>
      <input
        ref="input"
        v-model="authUrl"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :placeholder="install_auth_path_placeholder"
        class="hactive:outline-none flex-1 bg-white px-3 py-2 text-sm
          text-gray-800 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
    <FormFieldHint>{{ install_auth_path_description }}</FormFieldHint>
  </FormField>
</template>
