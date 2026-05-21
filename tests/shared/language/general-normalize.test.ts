import { describe, it, expect } from 'vitest';
import { generalNormalize } from '../../../shared/language/general-normalize';

describe('generalNormalize', () => {
  it('replaces ... with ellipsis character', () => {
    expect(generalNormalize('Wait...')).toBe('Wait\u2026');
  });

  it('replaces -- with em dash', () => {
    expect(generalNormalize('one -- two')).toBe('one \u2014 two');
  });

  it('replaces multiple occurrences', () => {
    expect(generalNormalize('A...B -- C...D')).toBe('A\u2026B \u2014 C\u2026D');
  });

  it('leaves other text unchanged', () => {
    expect(generalNormalize('Hello, world!')).toBe('Hello, world!');
  });

  it('handles empty string', () => {
    expect(generalNormalize('')).toBe('');
  });
});
