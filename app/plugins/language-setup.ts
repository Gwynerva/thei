import { type LanguageCode, loadLanguage } from '#layers/thei/shared/language';
import { language } from '../composables/language';

export default defineNuxtPlugin(async () => {
  const languageCode = useState<LanguageCode | undefined>('languageCode');

  if (import.meta.server) {
    const event = useRequestEvent();

    if (!event) {
      return;
    }

    languageCode.value = event.context.languageCode;
  }

  if (!languageCode.value) {
    return;
  }

  if (
    language.value === undefined ||
    language.value.code !== languageCode.value
  ) {
    language.value = await loadLanguage(languageCode.value);
  }

  useHead({
    htmlAttrs: {
      lang: computed(() => language.value?.code),
    },
  });
});
