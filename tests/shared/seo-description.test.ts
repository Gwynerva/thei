import { describe, expect, it } from 'vitest';
import { buildSeoDescription } from '../../shared/seo-description';

describe('buildSeoDescription', () => {
  it('joins the slogan and the text as sentences', () => {
    expect(buildSeoDescription(['Making things', '  I build  tools. '])).toBe(
      'Making things. I build tools.',
    );
  });

  it('keeps existing sentence punctuation and skips empty parts', () => {
    expect(buildSeoDescription(['Hello!', '', undefined, 'World'])).toBe(
      'Hello! World',
    );
  });

  it('cuts long text at a word boundary with an ellipsis', () => {
    const result = buildSeoDescription(['Slogan', 'word '.repeat(60)], 40);
    expect(result).toBe('Slogan. word word word word word word…');
    expect(Array.from(result).length).toBeLessThanOrEqual(40);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(buildSeoDescription(['😀'.repeat(10)], 10)).toBe('😀'.repeat(10));
  });
});
