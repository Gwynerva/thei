<script lang="ts" setup>
import {
  type LanguageCode,
  languageCodes,
  loadLanguage,
} from '#layers/thei/shared/language';

import InstallLoading from './components/InstallLoading.vue';
import InstallForm from './components/InstallForm.vue';

useHead({ title: 'Thei' });

const ready = ref(false);

onMounted(async () => {
  let languageCode: LanguageCode = 'en';
  let browserLanguageCode = navigator.language.toLowerCase().slice(0, 2);

  if (isOneOf(browserLanguageCode, languageCodes)) {
    languageCode = browserLanguageCode;
  }

  _language.value = await loadLanguage(languageCode);
  ready.value = true;
});
</script>

<template>
  <AdminGridWrapper>
    <TransitionFade mode="out-in">
      <InstallForm v-if="ready" />
      <InstallLoading v-else />
    </TransitionFade>
  </AdminGridWrapper>
</template>
