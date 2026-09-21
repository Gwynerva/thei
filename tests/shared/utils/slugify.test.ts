import { describe, expect, it } from 'vitest';
import { loadLanguage } from '../../../shared/language';
import {
  normalizeUrlSegment,
  slugify,
  urlSegmentIsValid,
} from '../../../shared/language/slugify';

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

describe('normalizeUrlSegment', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['Привет, Мир!', 'привет-мир'],
    ['a/b?c#d', 'a-bcd'],
    ['  spaced  out  ', 'spaced-out'],
    ['snake_case.and.dots', 'snake-case-and-dots'],
    ['--trimmed--', 'trimmed'],
    ["don't", 'dont'],
    ['100%_pure', '100-pure'],
    ['正式版', '正式版'],
  ])('normalizes %s', (value, expected) => {
    expect(normalizeUrlSegment(value)).toBe(expected);
  });

  it('accepts what it has already normalized', () => {
    expect(urlSegmentIsValid('привет-мир')).toBe(true);
    expect(urlSegmentIsValid('Привет Мир')).toBe(false);
  });
});
