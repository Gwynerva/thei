import { describe, it, expect } from 'vitest';
import { createPhraseProxy, I18nError } from '../../../shared/language/proxy';
import type {
  LanguagePhrases,
  I18nBaseModule,
} from '../../../shared/language/types';
import enModule from '../../../shared/language/list/en';

const basePhrases = (enModule as I18nBaseModule).phrases;

const identity = (s: string) => s;
const upper = (s: string) => s.toUpperCase();

describe('createPhraseProxy', () => {
  it('returns phrase from primary when present', () => {
    const proxy = createPhraseProxy(
      { theme: 'Тема' },
      basePhrases,
      identity,
      identity,
      'ru',
      'en',
    );
    expect(proxy.theme).toBe('Тема');
  });

  it('falls back to base when phrase missing in primary', () => {
    const proxy = createPhraseProxy(
      {},
      basePhrases,
      identity,
      identity,
      'ru',
      'en',
    );
    expect(proxy.theme).toBe('Theme');
  });

  it('applies primaryNormalize to primary string phrases', () => {
    const proxy = createPhraseProxy(
      { theme: 'тема' },
      basePhrases,
      upper,
      identity,
      'ru',
      'en',
    );
    expect(proxy.theme).toBe('ТЕМА');
  });

  it('applies baseNormalize (not primaryNormalize) to fallback phrases', () => {
    const proxy = createPhraseProxy(
      {},
      basePhrases,
      upper,
      identity,
      'ru',
      'en',
    );
    // base normalize is identity, so no uppercasing
    expect(proxy.theme).toBe('Theme');
  });

  it('applies primaryNormalize to function phrase return values', () => {
    const proxy = createPhraseProxy(
      { display_name_hint: (name: string) => `Hi, ${name}` },
      basePhrases,
      upper,
      identity,
      'ru',
      'en',
    );
    expect(proxy.display_name_hint('Alex')).toBe('HI, ALEX');
  });

  it('applies baseNormalize to fallback function phrase return values', () => {
    const proxy = createPhraseProxy(
      {},
      basePhrases,
      upper,
      identity,
      'ru',
      'en',
    );
    // base normalize is identity — result comes from the real en phrase, unchanged
    const result = proxy.display_name_hint('Alex');
    expect(result).toContain('Alex');
    // primary normalize (upper) must NOT have been applied
    expect(result).not.toBe(result.toUpperCase());
  });

  it('logs I18nError and returns {{ key }} fallback for missing phrase', () => {
    const proxy = createPhraseProxy(
      {},
      {} as LanguagePhrases,
      identity,
      identity,
      'ru',
      'en',
    );
    const errors: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);

    const result = proxy.theme;

    console.error = origError;

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(I18nError);
    expect(String(result)).toBe('{{ theme }}');
  });

  it('fallback is callable and returns {{ key }}', () => {
    const proxy = createPhraseProxy(
      {},
      {} as LanguagePhrases,
      identity,
      identity,
      'ru',
      'en',
    );
    const origError = console.error;
    console.error = () => {};

    const result = (proxy.display_name_hint as (...a: unknown[]) => string)(
      'Alex',
    );

    console.error = origError;

    expect(result).toBe('{{ display_name_hint }}');
  });
});
