import { describe, expect, it } from 'vitest';
import {
  normalizeExternalLinkUrl,
  normalizeExternalLinkAccentHue,
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
    expect(normalizeExternalLinkAccentHue(0)).toBe(0);
    expect(normalizeExternalLinkAccentHue(359)).toBe(359);
    expect(normalizeExternalLinkAccentHue(360)).toBeUndefined();
    expect(normalizeExternalLinkAccentHue(Number.NaN)).toBeUndefined();
  });

  it('truncates unicode text with an ellipsis', () => {
    expect(truncateExternalLinkText(` ${'🙂'.repeat(301)} `)).toBe(
      `${'🙂'.repeat(299)}…`,
    );
    expect(truncateExternalLinkText('  A   short\n title ')).toBe(
      'A short title',
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
