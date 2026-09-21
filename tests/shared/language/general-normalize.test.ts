import { describe, it, expect } from 'vitest';
import {
  bindShortWords,
  generalNormalize,
  normalizeInlineMarkup,
} from '../../../shared/language/general-normalize';

describe('generalNormalize', () => {
  it('replaces ... with ellipsis character', () => {
    expect(generalNormalize('Wait...')).toBe('Wait\u2026');
  });

  it('replaces -- with em dash and keeps it on the line above', () => {
    expect(generalNormalize('one -- two')).toBe('one\u00a0\u2014 two');
  });

  it('replaces multiple occurrences', () => {
    expect(generalNormalize('A...B -- C...D')).toBe(
      'A\u2026B\u00a0\u2014 C\u2026D',
    );
  });

  it('leaves a dash that already opens the line alone', () => {
    expect(generalNormalize('-- two')).toBe('\u2014 two');
  });

  it('leaves other text unchanged', () => {
    expect(generalNormalize('Hello, world!')).toBe('Hello, world!');
  });

  it('handles empty string', () => {
    expect(generalNormalize('')).toBe('');
  });
});

describe('bindShortWords', () => {
  it('ties a listed word to the word after it', () => {
    expect(bindShortWords('a walk in the park', ['a', 'in', 'the'])).toBe(
      'a\u00a0walk in\u00a0the\u00a0park',
    );
  });

  it('only binds whole words', () => {
    expect(bindShortWords('another antenna', ['an'])).toBe('another antenna');
  });

  it('binds after an opening quote or a dash', () => {
    expect(bindShortWords('\u2014 a word', ['a'])).toBe('\u2014 a\u00a0word');
  });

  it('leaves a trailing word alone', () => {
    expect(bindShortWords('nothing to', ['to'])).toBe('nothing to');
  });

  it('returns the text untouched without words', () => {
    expect(bindShortWords('as is', [])).toBe('as is');
  });
});

describe('normalizeInlineMarkup', () => {
  it('never rewrites what is inside a tag', () => {
    const html = '<a href="https://x.test/a--b">one -- two</a>';
    expect(normalizeInlineMarkup(html, generalNormalize)).toBe(
      '<a href="https://x.test/a--b">one\u00a0\u2014 two</a>',
    );
  });

  it('normalizes plain text with no markup at all', () => {
    expect(normalizeInlineMarkup('one -- two', generalNormalize)).toBe(
      'one\u00a0\u2014 two',
    );
  });
});
