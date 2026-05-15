import { loadLanguage } from '#layers/thei/shared/language';
import { language } from '../composables/language';

export default defineNuxtPlugin(async () => {
  if (import.meta.server) {
    const event = useRequestEvent();

    if (!event) {
      return;
    }

    const languageCode = event.context.languageCode;

    if (!languageCode) {
      return;
    }

    if (language.value === undefined || language.value.code !== languageCode) {
      language.value = await loadLanguage(languageCode);
    }
  }

  useHead({
    htmlAttrs: {
      lang: computed(() => language.value?.code),
    },
  });
});
