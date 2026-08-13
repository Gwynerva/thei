import { describe, expect, it } from 'vitest';
import { trimInlineSelectionOffsets } from '../../app/components/content/editor-inline-selection';

describe('trimInlineSelectionOffsets', () => {
  it.each([
    [' one', 1, 4],
    ['one ', 0, 3],
    ['\u00a0one\u2003', 1, 4],
    ['one two', 0, 7],
  ])('trims only selection edges in %j', (text, start, end) => {
    expect(trimInlineSelectionOffsets(text)).toEqual({ start, end });
  });

  it('supports offsets spanning multiple text nodes', () => {
    expect(trimInlineSelectionOffsets(['  one', ' two  '].join(''))).toEqual({
      start: 2,
      end: 9,
    });
  });

  it('treats whitespace-only selections as a no-op', () => {
    expect(trimInlineSelectionOffsets(' \t\u00a0')).toBeUndefined();
  });
});
