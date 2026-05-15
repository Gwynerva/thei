<script setup lang="ts">
import type { IconName } from '#thei/icons';
import FormField from '../FormField.vue';
import FormFieldHint from '../FormFieldHint.vue';
import FormFieldLabel from '../FormFieldLabel.vue';
import { useInstallPhrase } from '../../../install-language';
import {
  visualsThemes,
  type VisualsTheme,
} from '#layers/thei/app/scripts/visuals';

const {
  install_theme_label,
  install_theme_hint,
  install_theme_system,
  install_theme_light,
  install_theme_dark,
} = useInstallPhrase();

const visuals = useVisuals();

const theme2Label: Record<VisualsTheme, Ref<string>> = {
  system: install_theme_system,
  light: install_theme_light,
  dark: install_theme_dark,
} as const;

const theme2Icon: Record<VisualsTheme, IconName> = {
  system: 'contrast',
  light: 'sun',
  dark: 'moon',
} as const;
</script>

<template>
  <FormField>
    <FormFieldLabel>{{ install_theme_label }}</FormFieldLabel>
    <div
      class="border-gray-300 dark:border-gray-600 flex overflow-hidden
        rounded-lg border shadow-sm"
    >
      <button
        v-for="(option, i) of visualsThemes"
        :key="option"
        type="button"
        class="flex-1 cursor-pointer px-3 py-2 text-sm font-medium
          transition-colors hactive:z-10"
        :class="[
          visuals.theme === option
            ? 'bg-blue-100 text-blue-500 dark:bg-blue-900/30'
            : `text-gray-600 dark:bg-gray-800 dark:text-gray-300
              hactive:bg-gray-100 dark:hactive:bg-gray-700 bg-white`,
          i > 0 ? 'border-gray-300 dark:border-gray-600 border-l' : '',
        ]"
        @click="visuals.theme = option"
      >
        <Icon :name="theme2Icon[option]" class="mr-2 text-lg" />
        <span>{{ theme2Label[option] }}</span>
      </button>
    </div>
    <FormFieldHint>{{ install_theme_hint }}</FormFieldHint>
  </FormField>
</template>
