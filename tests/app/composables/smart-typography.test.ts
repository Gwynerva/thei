import { describe, expect, it } from 'vitest';
import {
  smartTypographyEdit,
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
