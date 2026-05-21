import type { LanguageCode, LanguagePhrases } from './types';

export class I18nError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'I18nError';
  }
}

export function createPhraseProxy(
  primary: Partial<LanguagePhrases>,
  base: LanguagePhrases,
  primaryNormalize: (text: string) => string,
  baseNormalize: (text: string) => string,
  primaryCode: LanguageCode,
  baseCode: LanguageCode,
): LanguagePhrases {
  const loggedMissing = new Set<string>();

  return new Proxy({} as LanguagePhrases, {
    get(_, key) {
      if (typeof key === 'symbol') return undefined;

      const k = key as string;
      const primaryValue = (primary as Record<string, unknown>)[k];

      if (primaryValue !== undefined) {
        if (typeof primaryValue === 'string') {
          return primaryNormalize(primaryValue);
        }
        if (typeof primaryValue === 'function') {
          return (...args: unknown[]) =>
            primaryNormalize(
              (primaryValue as (...a: unknown[]) => string)(...args),
            );
        }
        return primaryValue;
      }

      const baseValue = (base as Record<string, unknown>)[k];

      if (baseValue !== undefined) {
        if (typeof baseValue === 'string') {
          return baseNormalize(baseValue);
        }
        if (typeof baseValue === 'function') {
          return (...args: unknown[]) =>
            baseNormalize((baseValue as (...a: unknown[]) => string)(...args));
        }
        return baseValue;
      }

      if (!loggedMissing.has(k)) {
        loggedMissing.add(k);
        console.error(
          new I18nError(
            `Phrase "${k}" not found in "${primaryCode}" or base "${baseCode}" language`,
          ),
        );
      }

      const fallback = `{{ ${k} }}`;
      const fn = (..._args: unknown[]) => fallback;
      fn.toString = () => fallback;
      return fn;
    },
  });
}
