<script setup lang="ts">
import FormField from '../FormField.vue';
import FormFieldLabel from '../FormFieldLabel.vue';
import { useInstallPhrases } from '../../../install-language';

const emit = defineEmits<{
  change: [value: string];
}>();

const {
  install_password_label,
  install_password_placeholder,
  install_confirm_password_label,
  install_confirm_password_placeholder,
  install_error_passwords_mismatch,
} = useInstallPhrases();

const passwordInput = useTemplateRef('password');
const confirmInput = useTemplateRef('confirm');

const password = ref('');
const confirmPassword = ref('');
const confirmTouched = ref(false);

const outPassword = computed(() =>
  password.value && password.value === confirmPassword.value
    ? password.value
    : '',
);

watch(outPassword, (val) => emit('change', val));

const confirmError = computed((): string | undefined =>
  confirmTouched.value && confirmPassword.value !== password.value
    ? install_error_passwords_mismatch.value
    : undefined,
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <FormField>
      <FormFieldLabel :focus="passwordInput">
        {{ install_password_label }}
      </FormFieldLabel>
      <input
        ref="password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        :placeholder="install_password_placeholder"
        class="hactive:border-blue-500 hactive:ring-1 hactive:ring-blue-500
          hactive:outline-none w-full rounded-lg border border-gray-300 bg-white
          px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-600
          dark:bg-gray-800 dark:text-gray-100"
      />
    </FormField>
    <FormField>
      <FormFieldLabel :focus="confirmInput">
        {{ install_confirm_password_label }}
      </FormFieldLabel>
      <div class="flex flex-col gap-3">
        <input
          ref="confirm"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          :placeholder="install_confirm_password_placeholder"
          class="hactive:border-blue-500 hactive:ring-1 hactive:ring-blue-500
            hactive:outline-none w-full rounded-lg border border-gray-300
            bg-white px-3 py-2 text-sm text-gray-800 shadow-sm
            dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          @blur="confirmTouched = true"
        />
        <p v-if="confirmError" class="text-xs text-red-500 dark:text-red-400">
          {{ confirmError }}
        </p>
      </div>
    </FormField>
  </div>
</template>
