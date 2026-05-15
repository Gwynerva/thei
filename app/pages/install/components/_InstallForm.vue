<script lang="ts" setup>
import { getLanguagePhrase } from '#layers/thei/shared/language';
import type { LanguagePhraseId } from '#layers/thei/shared/language/phrases';
import AuthUrlField from './form/fields/AuthPathField.vue';
import DisplayNameField from './form/fields/DisplayNameField.vue';
import PasswordField from './form/fields/PasswordField.vue';
import ThemeField from './form/fields/ThemeField.vue';
import AccessField from './form/fields/AccessField.vue';
import LanguageField from './form/fields/LanguageField.vue';
import { useInstallLanguage, useInstallPhrase } from '../install-language';

const { install_title, install_subtitle, install_installing, install_submit } =
  useInstallPhrase();

const { language } = useInstallLanguage();

useHead(computed(() => ({ title: install_title.value })));

const isOpenAccess = ref<boolean>();
const displayName = ref<string>('');
const authPath = ref<string>('');
const password = ref<string>('');

const serverHandlingData = ref(false);
const errorPhraseId = ref<LanguagePhraseId>();
const errorDirectMessage = ref<string>();

const errorMessage = computed(() => {
  if (errorPhraseId.value) {
    return getLanguagePhrase(language.value, errorPhraseId.value);
  }
  return errorDirectMessage.value;
});

const canInstall = computed(
  () =>
    isOpenAccess.value !== undefined &&
    displayName.value.trim() !== '' &&
    authPath.value.trim() !== '' &&
    password.value.trim() !== '' &&
    !serverHandlingData.value,
);

async function handleInstall() {
  errorPhraseId.value = undefined;
  errorDirectMessage.value = undefined;
  serverHandlingData.value = true;

  try {
    const installResponse = await $fetch('/api/install/', {
      method: 'POST',
      body: {
        language: language.value?.code,
        authPath: authPath.value.trim(),
        isOpenAccess: isOpenAccess.value,
        displayName: displayName.value.trim(),
        password: password.value,
      },
    });

    if (installResponse.type === 'error') {
      errorPhraseId.value = installResponse.phraseId;
      return;
    }

    window.location.href = installResponse.redirectPath;
  } catch (installError: any) {
    errorDirectMessage.value =
      installError?.data?.message ??
      installError?.message ??
      installError.toString();
  } finally {
    serverHandlingData.value = false;
  }
}
</script>

<template>
  <CenteredCard maxWidth="md">
    <div class="w-full">
      <!-- Header -->
      <div class="flex flex-col items-center text-center">
        <Icon
          name="thei"
          class="text-gray-800 dark:text-gray-100 mb-3 text-6xl"
        />
        <h1
          class="text-gray-900 dark:text-gray-100 text-2xl font-bold
            tracking-tight"
        >
          {{ install_title }}
        </h1>
        <p class="text-gray-500 dark:text-gray-400 mt-1 font-semibold">
          {{ install_subtitle }}
        </p>
        <hr class="border-gray-300 dark:border-gray-600 my-8 w-full border-b" />
      </div>

      <!-- Form -->
      <form
        @submit.prevent="handleInstall"
        novalidate
        class="flex flex-col gap-3"
      >
        <LanguageField />
        <ThemeField />
        <AccessField @change="isOpenAccess = $event" />
        <DisplayNameField @change="displayName = $event" />
        <AuthUrlField @change="authPath = $event" />
        <PasswordField @change="password = $event" />

        <div
          v-if="errorMessage"
          class="border-red-200 bg-red-50 text-red-700 dark:border-red-800
            dark:bg-red-900/20 dark:text-red-400 mt-3 rounded-lg border px-4
            py-3 text-center text-sm"
        >
          {{ errorMessage }}
        </div>

        <AdminButton
          type="submit"
          class="mt-3"
          :icon="serverHandlingData ? 'loading' : undefined"
          :disabled="!canInstall"
        >
          {{ serverHandlingData ? install_installing : install_submit }}
        </AdminButton>
      </form>
    </div>
  </CenteredCard>
</template>
