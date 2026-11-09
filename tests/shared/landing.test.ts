import { describe, expect, it } from 'vitest';
import {
  isLandingPlaceHash,
  landingHash,
  parseLandingHash,
  type LandingPlace,
} from '../../shared/landing';

const text = (words: string) =>
  `:~:text=${encodeURIComponent(words).replaceAll('-', '%2D')}`;

describe('landing hashes', () => {
  const places: [LandingPlace, string][] = [
    [{ block: 'Xy3_ab-12' }, 'b-Xy3_ab-12'],
    [{ block: 'Xy3', file: 'stone-garden' }, 'b-Xy3~stone-garden'],
    [
      { block: 'Xy3', file: 'stone-garden', open: true },
      'b-Xy3~stone-garden~open',
    ],
    [{ file: 'stone-garden', zone: 'showcase' }, 'showcase~stone-garden'],
    [{ file: 'stone-garden', zone: 'files' }, 'files~stone-garden'],
    [
      { file: 'stone-garden', zone: 'files', open: true },
      'files~stone-garden~open',
    ],
    [
      { relation: { kind: 'project', href: '/projects/game-abc/' } },
      'r-project~%2Fprojects%2Fgame-abc%2F',
    ],
    [
      { link: 'https://example.com/a?b=c#d' },
      'l-https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc%23d',
    ],
    [{ status: '2025-06-01', zone: 'statuses' }, 'statuses~2025-06-01'],
    [{ avatar: 'a1b2', zone: 'avatars' }, 'avatars~a1b2'],
    [{ avatar: 'a1b2', zone: 'avatars', open: true }, 'avatars~a1b2~open'],
    [{ zone: 'facts' }, 'facts'],
    [{ zone: 'icon' }, 'icon'],
    [{ zone: 'banner' }, 'banner'],
    [{ zone: 'avatars' }, 'avatars'],
    [{ anchor: 'glava-1' }, 'glava-1'],
    [{}, ''],
  ];

  it.each(places)('writes %j as %s', (place, hash) => {
    expect(landingHash(place)).toBe(hash);
  });

  it('reads back every place it writes, with the words after it', () => {
    for (const [place, hash] of places) {
      if (!hash) continue;
      const read = parseLandingHash(`#${hash}${text('кинцуги — золото')}`);
      expect(read).toEqual({ ...place, words: ['кинцуги', 'золото'] });
    }
  });

  it('opens a window only on a file or an avatar', () => {
    expect(landingHash({ block: 'Xy3', open: true })).toBe('b-Xy3');
    expect(landingHash({ zone: 'files', open: true })).toBe('files');
    expect(landingHash({ file: 'stone-garden', zone: 'icon' })).toBe('icon');
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

  it('reads any other hash as an anchor of the page', () => {
    expect(parseLandingHash('#related-entities')).toEqual({
      anchor: 'related-entities',
      words: [],
    });
    expect(parseLandingHash('#%D0%B3%D0%BB%D0%B0%D0%B2%D0%B0')).toEqual({
      anchor: 'глава',
      words: [],
    });
    expect(parseLandingHash('')).toBeUndefined();
    expect(parseLandingHash('#')).toBeUndefined();
  });

  it('leaves an anchor to the router, and every other place to the landing', () => {
    expect(isLandingPlaceHash('#glava-1')).toBe(false);
    expect(isLandingPlaceHash('#project-sections')).toBe(false);
    expect(isLandingPlaceHash('')).toBe(false);
    expect(isLandingPlaceHash('#b-abc')).toBe(true);
    expect(isLandingPlaceHash('#statuses')).toBe(true);
    expect(isLandingPlaceHash('#files~stone-garden~open')).toBe(true);
    expect(isLandingPlaceHash(`#${text('маяк')}`)).toBe(true);
  });
});
