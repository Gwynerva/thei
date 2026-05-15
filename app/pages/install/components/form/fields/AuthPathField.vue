<script setup lang="ts">
import FormField from '../FormField.vue';
import FormFieldHint from '../FormFieldHint.vue';
import FormFieldLabel from '../FormFieldLabel.vue';
import { useInstallPhrase } from '../../../install-language';

const emit = defineEmits<{
  change: [value: string];
}>();

const {
  install_auth_path_label,
  install_auth_path_prefix,
  install_auth_path_placeholder,
  install_auth_path_description,
} = useInstallPhrase();

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
      class="border-gray-300 focus-within:border-blue-500
        focus-within:ring-blue-500 dark:border-gray-600 flex overflow-hidden
        rounded-lg border shadow-sm focus-within:ring-1"
    >
      <span
        class="border-gray-300 bg-gray-100 text-gray-500 dark:border-gray-600
          dark:bg-gray-700 dark:text-gray-400 flex items-center border-r px-3
          text-sm whitespace-nowrap select-none"
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
        class="text-gray-800 dark:bg-gray-800 dark:text-gray-100 flex-1 bg-white
          px-3 py-2 text-sm hactive:outline-none"
      />
    </div>
    <FormFieldHint>{{ install_auth_path_description }}</FormFieldHint>
  </FormField>
</template>
