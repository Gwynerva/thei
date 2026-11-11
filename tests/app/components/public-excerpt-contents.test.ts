import { describe, expect, it } from 'vitest';
import { publicOwnExcerptContents } from '#layers/thei/app/components/public/public-excerpt-contents';

type Listed = Parameters<typeof publicOwnExcerptContents>[0][number];

const subject = (name: string) =>
  ({ title: name, href: `/projects/${name}/` }) as Listed['about'][number];

const excerpt = (publicId: string, about?: string): Listed => ({
  publicId,
  title: `Title ${publicId}`,
  about: about ? [subject(about)] : [],
});

const contents = (excerpts: Listed[]) =>
  publicOwnExcerptContents(excerpts, (link) => `About ${link.title}`);

describe('publicOwnExcerptContents', () => {
  it('names what a run of excerpts is about, and each of them under it', () => {
    expect(contents([excerpt('a', 'kayak'), excerpt('b', 'kayak')])).toEqual([
      {
        title: 'About kayak',
        level: 2,
        id: 'excerpt-a',
        href: '#excerpt-a',
        path: 'excerpt-subject:a',
        covers: ['excerpt-a', 'excerpt-b'],
      },
      {
        title: 'Title a',
        level: 3,
        id: 'excerpt-a',
        href: '#excerpt-a',
        path: 'excerpt:a',
      },
      {
        title: 'Title b',
        level: 3,
        id: 'excerpt-b',
        href: '#excerpt-b',
        path: 'excerpt:b',
      },
    ]);
  });

  it('names a subject again when it comes back after another', () => {
    const list = contents([
      excerpt('a', 'kayak'),
      excerpt('b', 'roof'),
      excerpt('c', 'kayak'),
    ]);
    expect(list.map((item) => [item.level, item.title])).toEqual([
      [2, 'About kayak'],
      [3, 'Title a'],
      [2, 'About roof'],
      [3, 'Title b'],
      [2, 'About kayak'],
      [3, 'Title c'],
    ]);
    expect(
      list.filter((item) => item.covers).map((item) => item.covers),
    ).toEqual([['excerpt-a'], ['excerpt-b'], ['excerpt-c']]);
    expect(new Set(list.map((item) => item.path)).size).toBe(list.length);
  });

  it('lets an excerpt about nothing stand by its own title', () => {
    const list = contents([
      excerpt('a', 'kayak'),
      excerpt('b'),
      excerpt('c', 'kayak'),
    ]);
    expect(list.map((item) => [item.level, item.title, item.icon])).toEqual([
      [2, 'About kayak', undefined],
      [3, 'Title a', undefined],
      [2, 'Title b', undefined],
      [2, 'About kayak', undefined],
      [3, 'Title c', undefined],
    ]);
  });

  it('keeps two closed subjects apart though they go by one codename', () => {
    const closed = (publicId: string, key: string): Listed => ({
      publicId,
      title: `Title ${publicId}`,
      about: [
        { secret: true, key, title: 'Secret project Fox' },
      ] as unknown as Listed['about'],
    });
    const list = contents([
      closed('a', 'k1'),
      closed('b', 'k1'),
      closed('c', 'k2'),
    ]);
    expect(list.map((item) => [item.level, item.title])).toEqual([
      [2, 'About Secret project Fox'],
      [3, 'Title a'],
      [3, 'Title b'],
      [2, 'About Secret project Fox'],
      [3, 'Title c'],
    ]);
    expect(
      list.filter((item) => item.covers).map((item) => item.covers),
    ).toEqual([['excerpt-a', 'excerpt-b'], ['excerpt-c']]);
  });

  it('is empty for a page without excerpts', () => {
    expect(contents([])).toEqual([]);
  });
});
