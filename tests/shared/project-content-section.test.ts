import { describe, expect, it } from 'vitest';
import { normalizeProjectContentSections } from '../../shared/project-content-section';
import { normalizeProjectStages } from '../../shared/project-stage';

const content = (text = 'Body') => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

describe('project stages', () => {
  it('requires one valid period and sorts stages from oldest to newest', () => {
    expect(
      normalizeProjectStages([
        {
          title: 'Later',
          summary: '',
          isPrivate: false,
          period: { startDate: '2026-06-01', endDate: '2026-06-30' },
        },
        {
          title: 'Earlier',
          summary: '',
          isPrivate: false,
          period: { startDate: '2025-01-01', endDate: '2025-02-01' },
        },
      ])?.map((stage) => stage.title),
    ).toEqual(['Earlier', 'Later']);
  });

  it('allows no content and rejects missing or inverted periods', () => {
    expect(
      normalizeProjectStages([
        {
          title: 'Stage',
          summary: '',
          isPrivate: false,
          period: { startDate: '2026-01-01', endDate: '2026-01-02' },
        },
      ])?.[0]?.content,
    ).toBeUndefined();
    expect(() =>
      normalizeProjectStages([
        { title: 'Stage', summary: '', isPrivate: false },
      ]),
    ).toThrow('Stage period is required');
    expect(() =>
      normalizeProjectStages([
        {
          title: 'Stage',
          summary: '',
          isPrivate: false,
          period: { startDate: '2026-02-01', endDate: '2026-01-01' },
        },
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
            { type: 'contentMedia', data: { asset: null } },
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
          title: 'Text section',
          summary: '',
          isPrivate: false,
          content: content('Meaningful text'),
        },
        {
          title: 'Media section',
          summary: '',
          isPrivate: false,
          content: {
            data: {
              blocks: [
                {
                  type: 'contentMedia',
                  data: { asset: { assetUuid: 'a-existing' } },
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
          title: ' Second ',
          summary: ' Explanation ',
          isPrivate: false,
          content: content('Two'),
        },
        {
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
