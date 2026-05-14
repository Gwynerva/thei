import type { LanguageCode } from '#layers/thei/shared/language';
import type {
  LanguagePhrases,
  LanguagePhraseValue,
} from '#layers/thei/shared/language/phrases';

export const useLanguageCode = () => {
  return useState<LanguageCode | undefined>('language-code');
};

export const useLanguage = () => {
  return useNuxtApp().$language;
};

export function useLanguagePhrases() {
  const languageCode = useLanguageCode();
  const language = useLanguage();
  const phraseCache = new Map<string, ComputedRef<LanguagePhraseValue>>();

  type ComputedPhrases = {
    [PhraseId in keyof LanguagePhrases]: ComputedRef<LanguagePhrases[PhraseId]>;
  };

  return new Proxy({} as ComputedPhrases, {
    get(_, key) {
      if (typeof key === 'symbol') {
        return undefined;
      }

      if (!phraseCache.has(key)) {
        phraseCache.set(
          key,
          computed(() => {
            if (!languageCode.value) {
              throw createError('Language code is not set!');
            }

            if (!language.value) {
              throw createError('Language is not loaded!');
            }

            return language.value.phrases[key as keyof LanguagePhrases];
          }),
        );
      }

      return phraseCache.get(key);
    },
  });
}
