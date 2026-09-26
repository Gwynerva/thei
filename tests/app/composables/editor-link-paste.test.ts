import { describe, expect, it } from 'vitest';
import { pastedLinkTarget } from '../../../app/composables/editor-link-paste';

const site = {
  origins: ['https://example.com', 'http://localhost:3000'],
  base: '/',
};

describe('what a paste over selected text links to', () => {
  it('reads an address of this site as an internal link', () => {
    expect(
      pastedLinkTarget(' https://example.com/projects/studio-Pr0j/ ', site),
    ).toEqual({
      kind: 'internal',
      raw: 'https://example.com/projects/studio-Pr0j/',
    });
    expect(
      pastedLinkTarget('http://localhost:3000/tags/sea-0a1b2c/', site),
    ).toEqual({
      kind: 'internal',
      raw: 'http://localhost:3000/tags/sea-0a1b2c/',
    });
    expect(pastedLinkTarget('/diary/2024-05-12/', site)).toEqual({
      kind: 'internal',
      raw: '/diary/2024-05-12/',
    });
  });

  it('reads any other web address as an external link', () => {
    expect(pastedLinkTarget('https://other.org/a?b=1', site)).toEqual({
      kind: 'external',
      url: 'https://other.org/a?b=1',
    });
    expect(pastedLinkTarget('https://example.com/life/', site)).toEqual({
      kind: 'external',
      url: 'https://example.com/life/',
    });
  });

  it('leaves text that is not exactly one address to an ordinary paste', () => {
    expect(pastedLinkTarget('see https://other.org', site)).toBeUndefined();
    expect(
      pastedLinkTarget('https://a.org https://b.org', site),
    ).toBeUndefined();
    expect(pastedLinkTarget('other.org', site)).toBeUndefined();
    expect(pastedLinkTarget('/about', site)).toBeUndefined();
    expect(pastedLinkTarget('mailto:me@example.com', site)).toBeUndefined();
    expect(pastedLinkTarget('', site)).toBeUndefined();
  });
});
