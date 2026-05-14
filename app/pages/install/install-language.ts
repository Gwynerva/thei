import { type ShallowRef } from 'vue';
import {
  isLanguageCode,
  loadLanguage as _loadLanguage,
  type Language,
  type LanguageCode,
} from '#layers/thei/shared/language';
import type {
  LanguagePhrases,
  LanguagePhraseValue,
} from '#layers/thei/shared/language/phrases';

export function getBrowserLanguageCode(): LanguageCode {
  if (import.meta.server) {
    throw createError('Cannot get browser language code on the server!');
  }

  const navigatorLanguage = navigator.language || navigator.languages?.[0];
  const maybeLanguageCode = navigatorLanguage?.split('-')[0];

  return isLanguageCode(maybeLanguageCode) ? maybeLanguageCode : 'en';
}

export const installLanguageSymbol = Symbol('install-language') as InjectionKey<
  ShallowRef<Language | undefined>
>;

export function useInstallLanguage() {
  const language = inject(installLanguageSymbol) as ShallowRef<Language>;

  if (!language) {
    throw new Error(
      'useInstallLanguage() must be used inside the install page',
    );
  }

  async function loadLanguage(code: LanguageCode) {
    language!.value = await _loadLanguage(code);
  }

  return { language, loadLanguage };
}

export function useInstallPhrases() {
  const { language } = useInstallLanguage();
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
            if (!language.value) {
              return '';
            }
            return language.value.phrases[key as keyof LanguagePhrases];
          }),
        );
      }

      return phraseCache.get(key);
    },
  });
}
