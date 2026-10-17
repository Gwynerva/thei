import { describe, expect, it } from 'vitest';
import { loadLanguage } from '../../../shared/language';
import {
  normalizeUrlSegment,
  normalizeUrlSegmentDraft,
  slugify,
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

  it('leaves what it has already normalized as it is', () => {
    expect(normalizeUrlSegment('привет-мир')).toBe('привет-мир');
    expect(normalizeUrlSegment('snake-case-and-dots')).toBe(
      'snake-case-and-dots',
    );
  });
});

describe('normalizeUrlSegmentDraft', () => {
  it.each([
    ['My Page', 'my-page'],
    ['my ', 'my-'],
    ['my_', 'my-'],
    ['my?', 'my'],
    ['my page/', 'my-page-'],
    [' ', ''],
    ['', ''],
  ])('keeps a trailing gap while typing: %j', (value, expected) => {
    expect(normalizeUrlSegmentDraft(value)).toBe(expected);
  });
});
