import { createI18nController } from './controller';
import type {
  I18nBaseModule,
  I18nController,
  I18nModuleSpec,
  LanguageCode,
} from './types';

export type { LanguageCode, LanguagePhrases, LanguageSizeUnits } from './types';
export { languagesInfo, languageCodes } from './types';

/** Public alias for the runtime language object. */
export type LanguageInstance = I18nController;

const languageLoaders: Record<
  LanguageCode,
  () => Promise<{ default: I18nModuleSpec }>
> = {
  en: () => import('./list/en'),
  ru: () => import('./list/ru'),
};

export async function loadLanguage(
  languageCode: LanguageCode,
): Promise<I18nController> {
  const enImport = import('./list/en');
  const primaryImport =
    languageCode === 'en' ? enImport : languageLoaders[languageCode]();
  const [{ default: baseMod }, { default: primaryMod }] = await Promise.all([
    enImport,
    primaryImport,
  ]);
  return createI18nController(primaryMod, baseMod as I18nBaseModule);
}
