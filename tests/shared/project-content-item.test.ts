import { describe, expect, it } from 'vitest';
import {
  normalizeProjectContentSections,
  normalizeProjectStages,
  normalizeStagePeriods,
} from '../../shared/project-content-item';

const content = (text = 'Body') => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});
const link = { humanReadableSlug: 'item', publicId: 'ItemPublicId' };

describe('project stages', () => {
  it('requires one valid period and sorts stages from oldest to newest', () => {
    expect(
      normalizeProjectStages([
        {
          ...link,
          title: 'Later',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2026-06-01', endDate: '2026-06-30' }],
        },
        {
          ...link,
          publicId: 'EarlierPublicId',
          title: 'Earlier',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2025-01-01', endDate: '2025-02-01' }],
        },
      ])?.map((stage) => stage.title),
    ).toEqual(['Earlier', 'Later']);
  });

  it('allows no content and rejects missing or inverted periods', () => {
    expect(
      normalizeProjectStages([
        {
          ...link,
          title: 'Stage',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2026-01-01', endDate: '2026-01-02' }],
        },
      ])?.[0]?.content,
    ).toBeUndefined();
    expect(() =>
      normalizeProjectStages([
        { ...link, title: 'Stage', summary: '', isPrivate: false },
      ]),
    ).toThrow('Stage period is required');
    expect(() =>
      normalizeProjectStages([
        {
          ...link,
          title: 'Stage',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2026-02-01', endDate: '2026-01-01' }],
        },
      ]),
    ).toThrow('Invalid stage period');
  });
});

describe('stage periods', () => {
  it('sorts and merges overlaps but keeps adjacent days separate', () => {
    expect(
      normalizeStagePeriods([
        { startDate: '2026-01-10', endDate: '2026-01-15' },
        { startDate: '2026-01-05', endDate: '2026-01-12' },
        { startDate: '2026-01-16', endDate: '2026-01-20' },
      ]),
    ).toEqual([
      { startDate: '2026-01-05', endDate: '2026-01-15' },
      { startDate: '2026-01-16', endDate: '2026-01-20' },
    ]);
  });

  it('rejects date-time values', () => {
    expect(() =>
      normalizeStagePeriods([
        { startDate: '2026-01-01T12:00', endDate: '2026-01-02' },
      ]),
    ).toThrow('Invalid stage period');
  });
});

describe('project content sections', () => {
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
      normalizeProjectContentSections([
        {
          ...link,
          title: 'Section',
          summary: '',
          isPrivate: false,
          ...(sectionContent === undefined ? {} : { content: sectionContent }),
        },
      ]),
    ).toThrow('Content section cannot be empty');
  });

  it('rejects an invalid link instead of treating it as content', () => {
    expect(() =>
      normalizeProjectContentSections([
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
      normalizeProjectContentSections([
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
      normalizeProjectContentSections([
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
