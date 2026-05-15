import type { LanguagePhrases, LanguagePhraseId } from './phrases';

export const languagesInfo = {
  en: 'English',
  ru: 'Русский',
} as const satisfies Record<string, string>;

export type LanguageCode = keyof typeof languagesInfo;

export interface Language {
  code: Readonly<LanguageCode>;
  phrases: Readonly<LanguagePhrases>;
}

export type LanguageLoader = () => Promise<{ default: LanguagePhrases }>;

export const languageLoaders: Record<LanguageCode, LanguageLoader> = {
  en: () => import('./list/en'),
  ru: () => import('./list/ru'),
};

export function isLanguageCode(code: any): code is LanguageCode {
  return code in languagesInfo;
}

export async function loadLanguage(
  languageCode: LanguageCode,
): Promise<Language> {
  const loader = languageLoaders[languageCode];
  const languageModule = await loader();
  return {
    code: languageCode,
    phrases: languageModule.default,
  };
}

export function getLanguagePhrase<TPhraseId extends keyof LanguagePhrases>(
  language: Language,
  phraseId: TPhraseId,
): LanguagePhrases[TPhraseId] {
  return language.phrases[phraseId];
}
