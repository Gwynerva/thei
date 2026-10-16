import { describe, expect, it } from 'vitest';
import { normalizeContentData } from '../../../shared/content';
import { fileTextPlaces } from '../../../server/thei/assets/place-words';

/**
 * What a text says of a file at each of its places: the words the block
 * gives it, the heading it stands under and the text just around it — read
 * from a public place as a stranger reads the text.
 */

const asset = (assetUuid: string) => ({ assetUuid });
const paragraph = (id: string, text: string) => ({
  id,
  type: 'paragraph',
  data: { text },
});
const header = (id: string, text: string) => ({
  id,
  type: 'header',
  data: { text, level: 2 },
});
const edge = (id: string, edge: 'start' | 'end', sectionId = 's1') => ({
  id,
  type: 'privateSectionBoundary',
  data: { sectionId, edge },
});

const places = (blocks: unknown[], assetUuid = 'a-photo') =>
  fileTextPlaces(normalizeContentData({ blocks }), assetUuid);

describe('what a text says of a file', () => {
  it('reads its caption, its heading and the text on each side', () => {
    expect(
      places([
        header('h', 'At the <b>dacha</b>'),
        paragraph('p1', 'We came in June.'),
        {
          id: 'm',
          type: 'contentMedia',
          data: {
            layout: 'centered',
            caption: 'Grandmother <i>and</i> me',
            asset: asset('a-photo'),
          },
        },
        { id: 'd', type: 'delimiter', data: {} },
        paragraph('p2', 'She baked pies all day.'),
        header('h2', 'Back home'),
      ]),
    ).toEqual([
      {
        heading: 'At the dacha',
        words: { title: undefined, caption: 'Grandmother <i>and</i> me' },
        before: 'We came in June.',
        after: 'She baked pies all day.',
        isPrivate: false,
      },
    ]);
  });

  it('stops at a heading on either side', () => {
    const [place] = places([
      paragraph('p0', 'Another part.'),
      header('h', 'Recordings'),
      {
        id: 'a',
        type: 'contentAudio',
        data: { title: 'The talk', asset: asset('a-photo') },
      },
      header('h2', 'Next'),
      paragraph('p1', 'Later.'),
    ]);
    expect(place).toEqual({
      heading: 'Recordings',
      words: { title: 'The talk', caption: undefined },
      isPrivate: false,
    });
  });

  it('gives each place of a list, with the title of a group', () => {
    const found = places([
      {
        id: 'g',
        type: 'contentFileGroup',
        data: {
          title: 'Tickets',
          items: [
            { id: 'i1', asset: asset('a-photo'), title: 'There' },
            { id: 'i2', asset: asset('a-other'), title: 'Other' },
            { id: 'i3', asset: asset('a-photo'), caption: 'And back' },
          ],
        },
      },
    ]);
    expect(found.map((place) => place.words)).toEqual([
      { group: 'Tickets', title: 'There', caption: undefined },
      { group: 'Tickets', title: undefined, caption: 'And back' },
    ]);
  });

  it('reads a public place only with the public text around it', () => {
    const blocks = [
      header('h', 'Public'),
      edge('s', 'start'),
      header('hp', 'Secret heading'),
      paragraph('pp', 'Only the owner reads this.'),
      edge('e', 'end'),
      {
        id: 'm',
        type: 'contentMedia',
        data: { layout: 'centered', asset: asset('a-photo') },
      },
      edge('s2', 'start', 's2'),
      paragraph('pq', 'Private too.'),
      edge('e2', 'end', 's2'),
      paragraph('p', 'Said to everyone.'),
    ];
    expect(places(blocks)).toEqual([
      {
        heading: 'Public',
        words: { title: undefined, caption: undefined },
        after: 'Said to everyone.',
        isPrivate: false,
      },
    ]);
  });

  it('reads a private place with everything around it', () => {
    const [place] = places([
      paragraph('p', 'Said to everyone.'),
      edge('s', 'start'),
      {
        id: 'm',
        type: 'contentMedia',
        data: { layout: 'centered', asset: asset('a-photo') },
      },
      paragraph('pp', 'Only the owner reads this.'),
      edge('e', 'end'),
    ]);
    expect(place).toMatchObject({
      before: 'Said to everyone.',
      after: 'Only the owner reads this.',
      isPrivate: true,
    });
  });

  it('cuts a long text between words, nearest the file', () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const [place] = places([
      paragraph('p1', long),
      {
        id: 'm',
        type: 'contentMedia',
        data: { layout: 'centered', asset: asset('a-photo') },
      },
      paragraph('p2', long),
    ]);
    expect(place!.before!.startsWith('…word')).toBe(true);
    expect(place!.before!.endsWith('word119')).toBe(true);
    expect(place!.after!.startsWith('word0 ')).toBe(true);
    expect(place!.after!.endsWith('…')).toBe(true);
    expect(place!.before!.length).toBeLessThanOrEqual(281);
    expect(place!.after!.length).toBeLessThanOrEqual(281);
  });
});
