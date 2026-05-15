<script setup lang="ts">
import FormField from '../FormField.vue';
import FormFieldLabel from '../FormFieldLabel.vue';
import { useInstallPhrase } from '../../../install-language';

const emit = defineEmits<{
  change: [value: string];
}>();

const {
  install_password_label,
  install_password_placeholder,
  install_confirm_password_label,
  install_confirm_password_placeholder,
  install_error_passwords_mismatch,
} = useInstallPhrase();

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
        class="hactive:border-blue-500 hactive:ring-blue-500 border-gray-300
          text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100
          w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm
          hactive:ring-1 hactive:outline-none"
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
          class="hactive:border-blue-500 hactive:ring-blue-500 border-gray-300
            text-gray-800 dark:border-gray-600 dark:bg-gray-800
            dark:text-gray-100 w-full rounded-lg border bg-white px-3 py-2
            text-sm shadow-sm hactive:ring-1 hactive:outline-none"
          @blur="confirmTouched = true"
        />
        <p v-if="confirmError" class="text-red-500 dark:text-red-400 text-xs">
          {{ confirmError }}
        </p>
      </div>
    </FormField>
  </div>
</template>
