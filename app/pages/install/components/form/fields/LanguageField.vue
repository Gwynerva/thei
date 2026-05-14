<script setup lang="ts">
import { isLanguageCode, languagesInfo } from '#layers/thei/shared/language';
import FormField from '../FormField.vue';
import FormFieldHint from '../FormFieldHint.vue';
import FormFieldLabel from '../FormFieldLabel.vue';
import {
  useInstallLanguage,
  useInstallPhrases,
} from '../../../install-language';

const selectElement = useTemplateRef('select');
const { install_language_label, install_language_hint } = useInstallPhrases();
const { language, loadLanguage } = useInstallLanguage();

function onChange(event: Event) {
  const code = (event.target as HTMLSelectElement).value;
  if (isLanguageCode(code)) {
    loadLanguage(code);
  }
}
</script>

<template>
  <FormField>
    <FormFieldLabel :focus="selectElement">
      {{ install_language_label }}
    </FormFieldLabel>
    <div
      class="relative w-full rounded-lg border border-gray-300 bg-white
        shadow-sm focus-within:border-blue-500 focus-within:ring-1
        focus-within:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
    >
      <select
        ref="select"
        :value="language?.code"
        class="hactive:outline-none w-full cursor-pointer appearance-none
          bg-transparent py-2 pr-8 pl-3 text-sm text-gray-800
          dark:text-gray-100"
        @change="onChange"
      >
        <option
          v-for="(label, code) of languagesInfo"
          :key="code"
          :value="code"
          class="dark:bg-gray-800"
        >
          {{ code.toUpperCase() }} - {{ label }}
        </option>
      </select>
      <Icon
        name="chevron-right"
        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2
          rotate-90"
      />
    </div>
    <FormFieldHint>{{ install_language_hint }}</FormFieldHint>
  </FormField>
</template>
