import {
  loadLanguage,
  type Language,
  type LanguageCode,
} from '#layers/thei/shared/language';

const languageCache = new Map<LanguageCode, Promise<Language>>();

export default defineNuxtPlugin(async () => {
  const languageCode = useLanguageCode();
  const language = shallowRef<Language>();

  if (import.meta.server) {
    const event = useRequestEvent();
    languageCode.value = event?.context.languageCode;
  }

  if (languageCode.value) {
    let cachedLanguage = languageCache.get(languageCode.value);

    if (!cachedLanguage) {
      cachedLanguage = loadLanguage(languageCode.value);
      languageCache.set(languageCode.value, cachedLanguage);
    }

    language.value = await cachedLanguage;
  }

  useHead(() => ({
    htmlAttrs: {
      lang: languageCode,
    },
  }));

  return {
    provide: {
      language,
    },
  };
});
