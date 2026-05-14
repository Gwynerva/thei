<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import { useInstallPhrases } from '../../../install-language';
import FormField from '../FormField.vue';
import FormFieldLabel from '../FormFieldLabel.vue';

export type AccessType = 'open' | 'closed';

interface AccessOption {
  icon: IconName;
  label: ComputedRef<string>;
  description: ComputedRef<string>;
}

const emit = defineEmits<{
  change: [value: boolean];
}>();

const {
  install_access_label,
  install_access_open,
  install_access_closed,
  install_access_open_description,
  install_access_closed_description,
} = useInstallPhrases();

const options: Record<AccessType, AccessOption> = {
  open: {
    icon: 'lock-open',
    label: install_access_open,
    description: install_access_open_description,
  },
  closed: {
    icon: 'lock-close',
    label: install_access_closed,
    description: install_access_closed_description,
  },
};

const optionKeys = Object.keys(options) as AccessType[];

const accessType = ref<AccessType>();

watch(accessType, (val) => emit('change', val === 'open'));
</script>

<template>
  <FormField>
    <FormFieldLabel>{{ install_access_label }}</FormFieldLabel>
    <div class="flex flex-col gap-4">
      <button
        v-for="option in optionKeys"
        :key="option"
        type="button"
        class="flex cursor-pointer flex-col gap-2 rounded-lg border px-4 py-3
          text-left shadow-sm transition-colors"
        :class="[
          accessType === option
            ? option === 'open'
              ? `border-green-500 bg-green-100 dark:border-green-400
                dark:bg-green-900/30`
              : `border-red-500 bg-red-100 dark:border-red-400
                dark:bg-red-900/30`
            : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800',
        ]"
        @click="accessType = option"
      >
        <div class="flex items-center gap-2">
          <Icon
            :name="options[option].icon"
            class="text-lg"
            :class="
              accessType === option
                ? option === 'open'
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-700 dark:text-red-300'
                : 'text-gray-500'
            "
          />

          <span
            class="text-sm font-medium"
            :class="
              accessType === option
                ? option === 'open'
                  ? 'text-green-900 dark:text-green-100'
                  : 'text-red-900 dark:text-red-100'
                : ''
            "
          >
            {{ options[option].label }}
          </span>
        </div>

        <div class="text-xs text-gray-600 dark:text-gray-300">
          {{ options[option].description }}
        </div>
      </button>
    </div>
  </FormField>
</template>
