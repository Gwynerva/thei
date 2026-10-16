import { describe, expect, it } from 'vitest';
import {
  contentHeadingAnchors,
  contentPlaceLabel,
  isFixedContentPlace,
} from '../../shared/content-headings';
import { loadLanguage } from '../../shared/language';

const header = (text: string, level: 2 | 3 = 2) => ({
  type: 'header',
  data: { text, level },
});
const paragraph = (text: string) => ({ type: 'paragraph', data: { text } });
const boundary = (edge: 'start' | 'end') => ({
  type: 'privateSectionBoundary',
  data: { sectionId: 's1', edge },
});

describe('the anchors of a text’s headings', () => {
  it('are the same for the owner and for a reader who never sees the private ones', async () => {
    const { slugify } = await loadLanguage('en');
    const stored = {
      blocks: [
        header('Results'),
        boundary('start'),
        header('Results'),
        paragraph('Only for me.'),
        boundary('end'),
        header('Results'),
      ],
    };
    const owner = {
      blocks: [
        header('Results'),
        {
          type: 'privateSectionExpanded',
          data: { blocks: [header('Results'), paragraph('Only for me.')] },
        },
        header('Results'),
      ],
    };
    const stranger = {
      blocks: [
        header('Results'),
        { type: 'privateSectionPlaceholder', data: { blockCount: 2 } },
        header('Results'),
      ],
    };
    const ids = (data: { blocks: { type: string }[] }) =>
      contentHeadingAnchors(data as never, slugify).map((heading) => [
        heading.id,
        heading.private,
      ]);
    expect(ids(stored)).toEqual([
      ['results', false],
      ['results-3', true],
      ['results-2', false],
    ]);
    expect(ids(owner)).toEqual(ids(stored));
    expect(ids(stranger)).toEqual([
      ['results', false],
      ['results-2', false],
    ]);
  });

  it('never takes a place the page names itself', async () => {
    const { slugify } = await loadLanguage('en');
    const data = {
      blocks: [header('Related entities'), header('Project sections')],
    };
    expect(
      contentHeadingAnchors(data as never, slugify).map((item) => item.id),
    ).toEqual(['related-entities-2', 'project-sections-2']);
  });

  it('keeps the words of a heading plain, with its level and place', async () => {
    const { slugify } = await loadLanguage('ru');
    expect(
      contentHeadingAnchors(
        { blocks: [paragraph('x'), header('Итоги <b>года</b>', 3)] } as never,
        slugify,
      ),
    ).toEqual([
      {
        title: 'Итоги года',
        level: 3,
        id: 'itogi-goda',
        path: '1',
        private: false,
      },
    ]);
  });
});

describe('a place a link names that is not a heading', () => {
  it('is one the page always has, or a passage of text', () => {
    expect(isFixedContentPlace('project-sections')).toBe(true);
    expect(isFixedContentPlace('related-entities')).toBe(true);
    expect(isFixedContentPlace(':~:text=lanterns')).toBe(true);
    expect(isFixedContentPlace('results')).toBe(false);
  });

  it('reads as the words it names, decoded', () => {
    expect(contentPlaceLabel('%D0%B3%D0%BB%D0%B0%D0%B2%D0%B0')).toBe('глава');
    expect(contentPlaceLabel(':~:text=the%20harbour')).toBe('«the harbour»');
    // From start to end, without what comes before and after it.
    expect(
      contentPlaceLabel(':~:text=old-,the%20harbour,the%20gate,-at%20dusk'),
    ).toBe('«the harbour … the gate»');
    expect(contentPlaceLabel('%E0%A4')).toBe('%E0%A4');
  });
});
