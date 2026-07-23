import { describe, expect, it } from 'vitest';
import { loadLanguage } from '../../../shared/language';
import { slugify } from '../../../shared/language/slugify';

describe('language slugify', () => {
  it('uses Russian transliteration when the active language provides it', async () => {
    const ru = await loadLanguage('ru');
    expect(ru.slugify('Цифровой Garden XYZ')).toBe('tsifrovoy-garden-xyz');
  });

  it('uses language-neutral conversion in English', async () => {
    const en = await loadLanguage('en');
    expect(en.slugify('Цифровой Garden XYZ')).toBe('garden-xyz');
  });

  it('replaces special characters with one dash', () => {
    expect(slugify('hello,   world!!!again')).toBe('hello-world-again');
  });

  it('trims separator characters and permits an empty result', () => {
    expect(slugify(' -- hello -- ')).toBe('hello');
    expect(slugify('💥')).toBe('');
  });
});
