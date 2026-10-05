import { describe, expect, it } from 'vitest';
import { normalizeProjectSections } from '../../shared/project-content-item';
import { normalizePeriods } from '../../shared/period';

const content = (text = 'Body') => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});
const link = { humanReadableSlug: 'item', publicId: 'ItemPublicId' };

describe('project sections', () => {
  it('keeps undated ones in the given order, then dated ones oldest first', () => {
    expect(
      normalizeProjectSections([
        {
          ...link,
          publicId: 'LaterPublicId',
          title: 'Later',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2026-06-01', endDate: '2026-06-30' }],
        },
        {
          ...link,
          publicId: 'TopicPublicId',
          title: 'Topic',
          summary: '',
          isPrivate: false,
          content: content(),
        },
        {
          ...link,
          publicId: 'EarlierPublicId',
          title: 'Earlier',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2025-01-01', endDate: '2025-02-01' }],
        },
        {
          ...link,
          publicId: 'NotesPublicId',
          title: 'Notes',
          summary: '',
          isPrivate: false,
          periods: [],
          content: content(),
        },
      ])?.map((section) => section.title),
    ).toEqual(['Topic', 'Notes', 'Earlier', 'Later']);
  });

  it('takes a body, periods or both, but never neither', () => {
    const [onlyDates, both] = normalizeProjectSections([
      {
        ...link,
        title: 'Only dates',
        summary: '',
        isPrivate: false,
        periods: [{ startDate: '2026-01-01', endDate: '2026-01-02' }],
      },
      {
        ...link,
        publicId: 'BothPublicId',
        title: 'Both',
        summary: '',
        isPrivate: false,
        periods: [{ startDate: '2026-03-01', endDate: '2026-03-02' }],
        content: content(),
      },
    ])!;
    expect(onlyDates!.content.data.blocks).toEqual([]);
    expect(both!.content.data.blocks).toHaveLength(1);
    expect(() =>
      normalizeProjectSections([
        { ...link, title: 'Nothing', summary: '', isPrivate: false },
      ]),
    ).toThrow('A section needs a body or a period');
    expect(() =>
      normalizeProjectSections([
        {
          ...link,
          title: 'Inverted',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2026-02-01', endDate: '2026-01-01' }],
        },
      ]),
    ).toThrow('Invalid period');
  });
});

describe('periods', () => {
  it('sorts and merges overlaps but keeps adjacent days separate', () => {
    expect(
      normalizePeriods([
        { startDate: '2026-01-10', endDate: '2026-01-15' },
        { startDate: '2026-01-05', endDate: '2026-01-12' },
        { startDate: '2026-01-16', endDate: '2026-01-20' },
      ]),
    ).toEqual([
      {
        startDate: '2026-01-05',
        endDate: '2026-01-15',
        precision: 'exact',
        precisionNote: '',
        label: '',
      },
      {
        startDate: '2026-01-16',
        endDate: '2026-01-20',
        precision: 'exact',
        precisionNote: '',
        label: '',
      },
    ]);
  });

  it('keeps the wider doubt and the first explanation when merging', () => {
    expect(
      normalizePeriods([
        {
          startDate: '2026-01-10',
          endDate: '2026-01-15',
          precision: 'month',
          precisionNote: 'somewhere that winter',
        },
        { startDate: '2026-01-05', endDate: '2026-01-12' },
      ]),
    ).toEqual([
      {
        startDate: '2026-01-05',
        endDate: '2026-01-15',
        precision: 'month',
        precisionNote: 'somewhere that winter',
        label: '',
      },
    ]);
  });

  it('drops an explanation left behind by an exact date', () => {
    expect(
      normalizePeriods([
        {
          startDate: '2026-01-05',
          endDate: '2026-01-12',
          precision: 'exact',
          precisionNote: 'stale note',
        },
      ]),
    ).toEqual([
      {
        startDate: '2026-01-05',
        endDate: '2026-01-12',
        precision: 'exact',
        precisionNote: '',
        label: '',
      },
    ]);
  });

  it('merges overlapping periods only when they are named alike', () => {
    expect(
      normalizePeriods([
        { startDate: '2026-07-10', endDate: '2026-07-20', label: 'France' },
        { startDate: '2026-07-01', endDate: '2026-07-10', label: 'Italy' },
        { startDate: '2026-07-08', endDate: '2026-07-12', label: ' Italy ' },
      ]),
    ).toEqual([
      {
        startDate: '2026-07-01',
        endDate: '2026-07-12',
        precision: 'exact',
        precisionNote: '',
        label: 'Italy',
      },
      {
        startDate: '2026-07-10',
        endDate: '2026-07-20',
        precision: 'exact',
        precisionNote: '',
        label: 'France',
      },
    ]);
  });

  it('sorts again once a named period grows past another', () => {
    const periods = normalizePeriods([
      { startDate: '2026-01-01', endDate: '2026-01-05', label: 'x' },
      { startDate: '2026-01-01', endDate: '2026-01-08', label: 'y' },
      { startDate: '2026-01-03', endDate: '2026-01-12', label: 'x' },
    ]);
    expect(
      periods.map(({ startDate, endDate, label }) => [
        startDate,
        endDate,
        label,
      ]),
    ).toEqual([
      ['2026-01-01', '2026-01-08', 'y'],
      ['2026-01-01', '2026-01-12', 'x'],
    ]);
    expect(normalizePeriods(periods)).toEqual(periods);
  });

  it('orders periods with the same dates by their labels', () => {
    const dates = { startDate: '2026-03-01', endDate: '2026-03-02' };
    const sorted = normalizePeriods([
      { ...dates, label: 'b' },
      { ...dates, label: 'a' },
      { ...dates, label: '' },
    ]);
    expect(sorted.map((period) => period.label)).toEqual(['', 'a', 'b']);
    expect(normalizePeriods([...sorted].reverse())).toEqual(sorted);
  });

  it('reads a period without a label as unnamed and caps a label', () => {
    const day = { startDate: '2026-01-01', endDate: '2026-01-01' };
    expect(normalizePeriods([{ ...day, label: 7 }])[0]!.label).toBe('');
    expect(normalizePeriods([day])[0]!.label).toBe('');
    expect(
      normalizePeriods([{ ...day, label: 'я'.repeat(100) }])[0]!.label,
    ).toHaveLength(100);
    expect(() =>
      normalizePeriods([{ ...day, label: 'я'.repeat(101) }]),
    ).toThrow('Period label is too long');
  });

  it('rejects date-time values', () => {
    expect(() =>
      normalizePeriods([
        { startDate: '2026-01-01T12:00', endDate: '2026-01-02' },
      ]),
    ).toThrow('Invalid period');
  });
});

describe('section bodies', () => {
  it.each([
    ['missing content', undefined],
    ['null content', null],
    ['missing data', {}],
    ['no blocks', { data: { blocks: [] } }],
    [
      'blank text blocks',
      {
        data: {
          blocks: [
            { type: 'paragraph', data: { text: ' <br>&nbsp; ' } },
            { type: 'header', data: { text: '&#160;' } },
            { type: 'quote', data: { text: '', caption: ' ' } },
          ],
        },
      },
    ],
    [
      'empty structured blocks',
      {
        data: {
          blocks: [
            { type: 'list', data: { items: [] } },
            { type: 'contentMedia', data: { layout: 'centered', asset: null } },
            { type: 'contentGallery', data: { items: [] } },
            { type: 'contentAttachment', data: {} },
          ],
        },
      },
    ],
  ])('rejects %s', (_scenario, sectionContent) => {
    expect(() =>
      normalizeProjectSections([
        {
          ...link,
          title: 'Section',
          summary: '',
          isPrivate: false,
          ...(sectionContent === undefined ? {} : { content: sectionContent }),
        },
      ]),
    ).toThrow('A section needs a body or a period');
  });

  it('rejects an invalid link instead of treating it as content', () => {
    expect(() =>
      normalizeProjectSections([
        {
          ...link,
          title: 'Section',
          summary: '',
          isPrivate: false,
          content: {
            data: {
              blocks: [{ type: 'externalLink', data: { url: '' } }],
            },
          },
        },
      ]),
    ).toThrow('External link URL cannot be empty');
  });

  it('accepts text or media as meaningful content', () => {
    expect(
      normalizeProjectSections([
        {
          ...link,
          title: 'Text section',
          summary: '',
          isPrivate: false,
          content: content('Meaningful text'),
        },
        {
          ...link,
          publicId: 'MediaPublicId',
          title: 'Media section',
          summary: '',
          isPrivate: false,
          content: {
            data: {
              blocks: [
                {
                  type: 'contentMedia',
                  data: {
                    layout: 'centered',
                    asset: { assetUuid: 'a-existing' },
                  },
                },
              ],
            },
          },
        },
      ]),
    ).toHaveLength(2);
  });

  it('trims text and preserves manual order', () => {
    expect(
      normalizeProjectSections([
        {
          ...link,
          title: ' Second ',
          summary: ' Explanation ',
          isPrivate: false,
          content: content('Two'),
        },
        {
          ...link,
          publicId: 'FirstPublicId',
          title: 'First',
          summary: '',
          isPrivate: true,
          content: content('One'),
        },
      ]),
    ).toMatchObject([
      { title: 'Second', summary: 'Explanation' },
      { title: 'First', isPrivate: true },
    ]);
  });
});
