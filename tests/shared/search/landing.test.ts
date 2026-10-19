import { describe, expect, it } from 'vitest';
import {
  landingHash,
  parseLandingHash,
  type LandingPlace,
} from '../../../shared/search/landing';

const text = (words: string) =>
  `:~:text=${encodeURIComponent(words).replaceAll('-', '%2D')}`;

describe('landing hashes', () => {
  const places: [LandingPlace, string][] = [
    [{ block: 'Xy3_ab-12' }, 'b-Xy3_ab-12'],
    [{ block: 'Xy3', file: 'stone-garden' }, 'b-Xy3~stone-garden'],
    [{ file: 'stone-garden', zone: 'showcase' }, 'f-stone-garden'],
    [
      { relation: { kind: 'project', href: '/projects/game-abc/' } },
      'r-project~%2Fprojects%2Fgame-abc%2F',
    ],
    [
      { link: 'https://example.com/a?b=c#d' },
      'l-https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc%23d',
    ],
    [{ status: '2025-06-01', zone: 'statuses' }, 'statuses~2025-06-01'],
    [{ zone: 'facts' }, 'facts'],
    [{ zone: 'icon' }, 'icon'],
    [{ zone: 'banner' }, 'banner'],
    [{}, ''],
  ];

  it.each(places)('writes %j as %s', (place, hash) => {
    expect(landingHash(place)).toBe(hash);
  });

  it('reads back every place it writes, with the words after it', () => {
    for (const [place, hash] of places) {
      if (!hash) continue;
      const read = parseLandingHash(`#${hash}${text('кинцуги — золото')}`);
      expect(read).toMatchObject({
        ...(place.block ? { block: place.block } : {}),
        ...(place.file ? { file: place.file } : {}),
        ...(place.relation ? { relation: place.relation } : {}),
        ...(place.link ? { link: place.link } : {}),
        ...(place.status ? { status: place.status } : {}),
        words: ['кинцуги', 'золото'],
      });
    }
  });

  it('reads a hash the router has already decoded', () => {
    expect(parseLandingHash('#r-event~/events/tool-wall-zOh/')).toEqual({
      relation: { kind: 'event', href: '/events/tool-wall-zOh/' },
      words: [],
    });
    expect(parseLandingHash('#b-abc:~:text=Ножовка')).toEqual({
      block: 'abc',
      words: ['Ножовка'],
    });
  });

  it('looks the page through for words with no place before them', () => {
    expect(parseLandingHash(`#${text('Смотритель маяка')}`)).toEqual({
      words: ['Смотритель', 'маяка'],
    });
  });

  it('leaves alone a hash of the page’s own', () => {
    expect(parseLandingHash('#related')).toBeUndefined();
    expect(parseLandingHash('#glava-1')).toBeUndefined();
    expect(parseLandingHash('')).toBeUndefined();
  });
});
