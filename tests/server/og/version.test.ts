import { describe, expect, it } from 'vitest';
import { emptyOgContent } from '../../../server/thei/og/model';
import { ogCardVersion, ogContentKey } from '../../../server/thei/og/version';
import { buildOgImagePath, buildOgInfoPath } from '../../../shared/og-url';

const base = () =>
  emptyOgContent(
    'project',
    'p',
    'Title',
    { name: 'Site' },
    { hue: 10, chroma: 0.1 },
  );

describe('card versions', () => {
  it('stay the same for the same card', () => {
    expect(ogCardVersion(base())).toBe(ogCardVersion(base()));
    expect(ogContentKey(base())).toBe(ogContentKey(base()));
  });

  it('change with anything the card shows', () => {
    const version = ogCardVersion(base());
    expect(ogCardVersion({ ...base(), headline: 'Other' })).not.toBe(version);
    expect(ogCardVersion({ ...base(), tags: ['new'] })).not.toBe(version);
    expect(
      ogCardVersion({ ...base(), site: { name: 'Site', domain: 'a.example' } }),
    ).not.toBe(version);
  });

  it('name a picture by its bytes, not by where it is stored', () => {
    const picture = (file: string, key = 'abc.webp') => ({
      ...base(),
      picture: { type: 'file' as const, key, file },
    });
    // A restored copy of a site keeps its files elsewhere: same card.
    expect(ogCardVersion(picture('/a/abc.webp'))).toBe(
      ogCardVersion(picture('/b/abc.webp')),
    );
    expect(ogCardVersion(picture('/a/abc.webp'))).not.toBe(
      ogCardVersion(picture('/a/def.webp', 'def.webp')),
    );
  });
});

describe('card addresses', () => {
  it('leave the base path to the way out', () => {
    expect(buildOgImagePath({ kind: 'site', id: 'site' })).toBe('/og/site.png');
    expect(buildOgImagePath({ kind: 'diary', id: '2024-09-03' })).toBe(
      '/og/diary/2024-09-03.png',
    );
    expect(buildOgImagePath({ kind: 'page', id: 'a b' })).toBe(
      '/og/page/a%20b.png',
    );
    expect(buildOgInfoPath({ kind: 'service', id: 'life' })).toBe(
      '/api/og/service/life',
    );
  });
});
