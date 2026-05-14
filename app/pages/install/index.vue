<script lang="ts" setup>
import { type Language, loadLanguage } from '#layers/thei/shared/language';
import {
  getBrowserLanguageCode,
  installLanguageSymbol,
} from './install-language';
import InstallLoading from './components/InstallLoading.vue';
import InstallForm from './components/InstallForm.vue';

useHead({ title: 'Thei' });

const installLanguage = shallowRef<Language>();
provide(installLanguageSymbol, installLanguage);

const ready = ref(false);

onMounted(async () => {
  const initialLanguageCode = getBrowserLanguageCode();
  installLanguage.value = await loadLanguage(initialLanguageCode);
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
