import { normalizeImageAccent } from '../../shared/accent-color';
import { describe, expect, it } from 'vitest';
import {
  normalizeExternalLinkUrl,
  truncateExternalLinkText,
} from '../../shared/external-link';

describe('external links', () => {
  it('canonicalizes HTTP URLs while retaining path, query, and fragment', () => {
    expect(
      normalizeExternalLinkUrl(' HTTPS://Example.COM:443/a?x=1#part '),
    ).toBe('https://example.com/a?x=1#part');
    expect(normalizeExternalLinkUrl('https://example.com/a')).not.toBe(
      normalizeExternalLinkUrl('https://example.com/b'),
    );
    expect(
      normalizeExternalLinkUrl('https://example.com/a?view=1#top'),
    ).not.toBe(normalizeExternalLinkUrl('https://example.com/a?view=2#top'));
    expect(
      normalizeExternalLinkUrl('https://example.com/a?view=1#top'),
    ).not.toBe(normalizeExternalLinkUrl('https://example.com/a?view=1#bottom'));
  });

  it('rejects unsupported protocols and credentials', () => {
    expect(() => normalizeExternalLinkUrl('javascript:alert(1)')).toThrow();
    expect(() =>
      normalizeExternalLinkUrl('https://user:secret@example.com/'),
    ).toThrow();
  });

  it('accepts the full hue range including red at zero', () => {
    expect(normalizeImageAccent({ hue: 0, chroma: 0.15 })).toEqual({
      hue: 0,
      chroma: 0.15,
    });
    expect(normalizeImageAccent({ hue: 359, chroma: 0.15 })).toEqual({
      hue: 359,
      chroma: 0.15,
    });
    expect(normalizeImageAccent({ hue: 360, chroma: 0.15 })).toBeUndefined();
    expect(
      normalizeImageAccent({ hue: Number.NaN, chroma: 0.15 }),
    ).toBeUndefined();
  });

  it('truncates unicode text with an ellipsis', () => {
    expect(truncateExternalLinkText(` ${'🙂'.repeat(301)} `)).toBe(
      `${'🙂'.repeat(299)}…`,
    );
    expect(truncateExternalLinkText('  A   short\n title ')).toBe(
      'A short title',
    );
    expect(truncateExternalLinkText('🙂'.repeat(121), 120)).toBe(
      `${'🙂'.repeat(119)}…`,
    );
  });

  it('normalizes an Editor.js external link block', async () => {
    const { normalizeContentData } = await import('../../shared/content');
    expect(
      normalizeContentData({
        blocks: [
          {
            type: 'externalLink',
            data: {
              url: 'https://EXAMPLE.com/path',
              title: 'hydrated display data is stripped',
            },
          },
        ],
      }).blocks,
    ).toEqual([
      {
        type: 'externalLink',
        data: { url: 'https://example.com/path' },
        id: undefined,
      },
    ]);
  });
});
