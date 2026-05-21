import pc from 'picocolors';
import {
  loadLanguage,
  languageCodes,
  type LanguageInstance,
  type LanguageCode,
} from '#layers/thei/shared/language';
import { setBootError } from './boot/result';

export let currentLanguage: LanguageInstance | undefined;

export function getCurrentLanguagePhrases() {
  if (!currentLanguage) {
    throw new Error('Current language is not loaded!');
  }
  return currentLanguage.phrase;
}

export async function setCurrentLanguage(languageCode: LanguageCode) {
  currentLanguage = await loadLanguage(languageCode);
}

export async function bootTheiLanguage() {
  const languageCode = THEI_SERVER.config.languageCode;

  if (!isOneOf(languageCode, languageCodes)) {
    THEI_SERVER.console.error(
      `Invalid language code in config: ${pc.red(
        pc.bold(String(languageCode)),
      )}!`,
    );
    setBootError(`Invalid language code in config "${languageCode}"!`);
  }

  await setCurrentLanguage(THEI_SERVER.config.languageCode);
  THEI_SERVER.console
    .tag('Boot')
    .log(`Language ${pc.cyan(THEI_SERVER.phrase.language_name)} loaded!`);
}
