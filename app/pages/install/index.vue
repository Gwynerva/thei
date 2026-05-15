<script lang="ts" setup>
import {
  isLanguageCode,
  type Language,
  type LanguageCode,
  loadLanguage,
} from '#layers/thei/shared/language';

import InstallLoading from './components/InstallLoading.vue';
import InstallForm from './components/InstallForm.vue';

useHead({ title: 'Thei' });

const ready = ref(false);

onMounted(async () => {
  let languageCode: LanguageCode = 'en';
  let browserLanguageCode = navigator.language.toLowerCase().slice(0, 2);

  if (isLanguageCode(browserLanguageCode)) {
    languageCode = browserLanguageCode;
  }

  language.value = await loadLanguage(languageCode);
  ready.value = true;
});
</script>

<template>
  <AdminGridWrapper>
    <TransitionFade mode="out-in">
      <InstallForm v-if="ready" key="form" />
      <InstallLoading v-else key="loading" />
    </TransitionFade>
  </AdminGridWrapper>
</template>
