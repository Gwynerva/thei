import { describe, expect, it } from 'vitest';
import {
  fieldTakesTypography,
  smartTypographyEdit,
  smartTypographyEdits,
  smartTypographyRun,
  smartTypographyText,
  SMART_TYPOGRAPHY_RULES,
} from '../../../app/composables/smart-typography';

describe('smartTypographyEdit', () => {
  it('turns three dots into an ellipsis wherever they are typed', () => {
    expect(smartTypographyEdit('Wait...')).toEqual({
      start: 4,
      original: '...',
      replacement: '…',
    });
  });

  it('turns two hyphens after a space into a dash', () => {
    expect(smartTypographyEdit('one --')).toEqual({
      start: 3,
      original: ' --',
      replacement: ' —',
    });
  });

  it('turns two hyphens at the very start into a dash', () => {
    expect(smartTypographyEdit('--')).toEqual({
      start: 0,
      original: '--',
      replacement: '—',
    });
  });

  it('leaves glued hyphens alone', () => {
    expect(smartTypographyEdit('well--known')).toBeUndefined();
    expect(smartTypographyEdit('--flag=1')).toBeUndefined();
    expect(smartTypographyEdit('one--')).toBeUndefined();
  });

  it('does nothing until the shorthand is complete', () => {
    expect(smartTypographyEdit('one -')).toBeUndefined();
    expect(smartTypographyEdit('Wait..')).toBeUndefined();
  });

  it('only looks at the end of the text, where the caret is', () => {
    expect(smartTypographyEdit('... and then')).toBeUndefined();
  });

  it('accepts a caller-supplied rule set', () => {
    expect(
      smartTypographyEdit('(c)', [{ pattern: /\(c\)$/, replacement: '©' }]),
    ).toEqual({ start: 0, original: '(c)', replacement: '©' });
  });

  it('ships rules that are anchored to the caret', () => {
    for (const rule of SMART_TYPOGRAPHY_RULES)
      expect(rule.pattern.source.endsWith('$')).toBe(true);
  });
});

describe('smartTypographyText', () => {
  it('makes a dash of two hyphens standing alone', () => {
    expect(smartTypographyText('one -- two')).toBe('one — two');
    expect(smartTypographyText('-- one')).toBe('— one');
    expect(smartTypographyText('one --')).toBe('one —');
    expect(smartTypographyText('(-- one) «-- two»')).toBe('(— one) «— two»');
    expect(smartTypographyText('one --, two --.')).toBe('one —, two —.');
    expect(smartTypographyText('a -- -- b')).toBe('a — — b');
  });

  it('leaves hyphens glued to words, flags and rows of hyphens', () => {
    for (const text of [
      'well--known',
      'git log --oneline',
      '--flag=1',
      'one--',
      'a ---',
      '---',
      'a --- b',
    ])
      expect(smartTypographyText(text)).toBe(text);
  });

  it('makes an ellipsis of exactly three dots', () => {
    expect(smartTypographyText('Wait... and...')).toBe('Wait… and…');
    expect(smartTypographyText('...so')).toBe('…so');
    expect(smartTypographyText('a.... b...... c..')).toBe('a.... b...... c..');
  });

  it('never touches a web address', () => {
    for (const text of [
      'https://example.com/a...b',
      'see https://example.com/--x/... now',
      'www.example.com/...',
    ])
      expect(smartTypographyText(text)).toBe(text);
    expect(smartTypographyText('see https://a.b/c...d... ok...')).toBe(
      'see https://a.b/c...d... ok…',
    );
  });

  it('reads the letters on either side of the paste, and changes only the paste', () => {
    expect(smartTypographyText('-- b', { before: 'a' })).toBe('-- b');
    expect(smartTypographyText('-- b', { before: 'a ' })).toBe('— b');
    expect(smartTypographyText('a --', { after: 'x' })).toBe('a --');
    expect(smartTypographyText('a --', { after: ' x' })).toBe('a —');
    expect(smartTypographyText('...', { before: '.' })).toBe('...');
    expect(smartTypographyText('..', { before: '.' })).toBe('..');
    expect(smartTypographyText('-', { before: ' -', after: ' ' })).toBe('-');
  });

  it('keeps every space and line break, and has nothing left to format twice', () => {
    const text = ' one -- two...\n\nthree --\r\nfour ';
    const once = smartTypographyText(text);
    expect(once).toBe(' one — two…\n\nthree —\r\nfour ');
    expect(once.replace(/\S/g, '')).toBe(text.replace(/\S/g, ''));
    expect(smartTypographyText(once)).toBe(once);
  });

  it('reports its changes as offsets into the paste', () => {
    expect(smartTypographyEdits('a -- b...', { before: 'x ' })).toEqual([
      { start: 2, length: 2, replacement: '—' },
      { start: 6, length: 3, replacement: '…' },
    ]);
  });
});

describe('smartTypographyRun', () => {
  it('reads texts split by markup as one, and changes each within itself', () => {
    expect(smartTypographyRun(['one ', '-- two', '...'])).toEqual([
      'one ',
      '— two',
      '…',
    ]);
    expect(smartTypographyRun(['one -', '- two'])).toEqual(['one -', '- two']);
    expect(smartTypographyRun(['one..', '.'])).toEqual(['one..', '.']);
    expect(smartTypographyRun(['a', ' -- ', 'b...'])).toEqual([
      'a',
      ' — ',
      'b…',
    ]);
  });
});

describe('fieldTakesTypography', () => {
  it('formats prose, and leaves technical fields as typed', () => {
    expect(fieldTakesTypography({ type: 'text', spellcheck: 'true' })).toBe(
      true,
    );
    expect(fieldTakesTypography({})).toBe(true);
    expect(fieldTakesTypography({ spellcheck: 'false' })).toBe(false);
    expect(fieldTakesTypography({ spellcheck: false })).toBe(false);
    expect(fieldTakesTypography({ type: 'text' }, true)).toBe(false);
  });

  it('never formats a password, whatever it is marked', () => {
    expect(fieldTakesTypography({ type: 'password' })).toBe(false);
    expect(fieldTakesTypography({ type: 'password', spellcheck: 'true' })).toBe(
      false,
    );
  });
});
