import { type LanguageCode, loadLanguage } from '#layers/thei/shared/language';
import { _language, language } from '../composables/language';

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
    _language.value === undefined ||
    _language.value.code !== languageCode.value
  ) {
    _language.value = await loadLanguage(languageCode.value);
  }

  useHead({
    htmlAttrs: {
      lang: computed(() => language.value.code),
    },
  });
});
