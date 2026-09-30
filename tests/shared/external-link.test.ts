import { normalizeImageAccent } from '../../shared/accent-color';
import { describe, expect, it } from 'vitest';
import {
  externalLinkHostLooksComplete,
  externalLinkIdentity,
  normalizeExternalLinkUrl,
  truncateExternalLinkText,
  validateExternalLinkList,
  validateNamedExternalLinkList,
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

  it('tells a finished host from one still being typed', () => {
    for (const url of [
      'https://example.com',
      'https://example.com/path?x=1#top',
      'https://sub.example.co.uk',
      'https://пример.рф',
      'https://192.168.1.10',
      'https://[2001:db8::1]',
      'https://example.com:8080',
      'http://Example.COM/',
    ])
      expect(externalLinkHostLooksComplete(url), url).toBe(true);
    for (const url of [
      '',
      'https://',
      'https://exa',
      'https://example.',
      'https://example.c',
      'https://192.168',
      'https://1',
      'https://сайт.р',
      'https://localhost:3000',
      'https://example..com',
      'ftp://example.com',
      'example.com',
      'https://u@example.com',
    ])
      expect(externalLinkHostLooksComplete(url), url).toBe(false);
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

  it("keeps a link block's note only when it has words", async () => {
    const { contentSemanticKey, normalizeContentData } =
      await import('../../shared/content');
    const block = (data: Record<string, unknown>) => ({
      blocks: [
        { type: 'externalLink', data: { url: 'https://a.test/', ...data } },
      ],
    });
    expect(
      normalizeContentData(block({ note: '  Why   it  matters ' })).blocks[0]
        ?.data,
    ).toEqual({ url: 'https://a.test/', note: 'Why it matters' });
    expect(
      normalizeContentData(block({ note: '   ' })).blocks[0]?.data,
    ).toEqual({ url: 'https://a.test/' });
    // A block stored before notes existed reads exactly as it did.
    expect(contentSemanticKey(block({ note: '' }))).toBe(
      contentSemanticKey(block({})),
    );
    expect(contentSemanticKey(block({ note: 'Why' }))).not.toBe(
      contentSemanticKey(block({})),
    );
  });

  it('tells pages apart as a reader does', () => {
    expect(externalLinkIdentity('https://a.test/docs/#intro')).toBe(
      externalLinkIdentity('https://a.test/docs'),
    );
    expect(externalLinkIdentity('https://a.test/')).toBe('https://a.test/');
    expect(externalLinkIdentity('https://a.test/?q=1')).not.toBe(
      externalLinkIdentity('https://a.test/?q=2'),
    );
    expect(externalLinkIdentity('not a url')).toBe('not a url');
  });
});

describe('manual link lists', () => {
  const fail = (message: string): never => {
    throw new Error(message);
  };

  it('keeps each entry’s note, trimmed, and needs no name', () => {
    expect(
      validateExternalLinkList(
        [
          { url: 'https://a.test', note: '  Why  ', isPrivate: false },
          { url: 'https://b.test/', note: '', isPrivate: true },
        ],
        fail,
      ),
    ).toEqual([
      { url: 'https://a.test/', note: 'Why', isPrivate: false },
      { url: 'https://b.test/', note: '', isPrivate: true },
    ]);
    expect(() =>
      validateExternalLinkList(
        [{ url: 'https://a.test/', note: 'x'.repeat(301), isPrivate: false }],
        fail,
      ),
    ).toThrow('External link note is too long');
  });

  it('leaves the note out of an entry an older panel sent without one', () => {
    expect(
      validateExternalLinkList(
        [{ url: 'https://a.test/', name: 'Old name', isPrivate: false }],
        fail,
      ),
    ).toEqual([{ url: 'https://a.test/', isPrivate: false }]);
  });

  it('needs a name for every entry of a named list', () => {
    expect(
      validateNamedExternalLinkList(
        [{ url: 'https://a.test/', name: ' GitHub ', isPrivate: false }],
        fail,
      ),
    ).toEqual([{ url: 'https://a.test/', name: 'GitHub', isPrivate: false }]);
    expect(() =>
      validateNamedExternalLinkList(
        [{ url: 'https://a.test/', name: ' ', note: 'Why', isPrivate: false }],
        fail,
      ),
    ).toThrow('External link name cannot be empty');
  });
});
