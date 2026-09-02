import { describe, expect, it } from 'vitest';
import { buildContentHeadings } from '#layers/thei/app/components/content/content-headings';
import { loadLanguage } from '#layers/thei/shared/language';
import type { PublicContentOutputData } from '#layers/thei/shared/content';

function header(text: string, level: 2 | 3 = 2) {
  return { type: 'header' as const, data: { text, level } };
}

describe('buildContentHeadings', () => {
  it('preserves document order and heading levels with localized slugs', async () => {
    const ru = await loadLanguage('ru');
    const data = {
      blocks: [
        header('Первый раздел'),
        { type: 'paragraph' as const, data: { text: 'Текст' } },
        header('Детали', 3),
      ],
    };

    expect(buildContentHeadings(data, ru.slugify)).toEqual([
      {
        title: 'Первый раздел',
        level: 2,
        id: 'pervyy-razdel',
        href: '#pervyy-razdel',
        path: '0',
      },
      {
        title: 'Детали',
        level: 3,
        id: 'detali',
        href: '#detali',
        path: '2',
      },
    ]);
  });

  it('uses the active language slugifier', async () => {
    const en = await loadLanguage('en');
    const ru = await loadLanguage('ru');
    const data = { blocks: [header('Цифровой Garden')] };

    expect(buildContentHeadings(data, ru.slugify)[0]?.id).toBe(
      'tsifrovoy-garden',
    );
    expect(buildContentHeadings(data, en.slugify)[0]?.id).toBe('garden');
  });

  it('makes duplicate, empty, and naturally suffixed slugs unique', async () => {
    const en = await loadLanguage('en');
    const data = {
      blocks: [
        header('Title'),
        header('Title'),
        header('Title 2'),
        header('💥'),
        header('💥'),
      ],
    };

    expect(
      buildContentHeadings(data, en.slugify).map((item) => item.id),
    ).toEqual(['title', 'title-2', 'title-2-2', 'heading', 'heading-2']);
  });

  it('renders every heading authorized in the server payload', async () => {
    const en = await loadLanguage('en');
    const data: PublicContentOutputData = {
      blocks: [
        header('Public'),
        {
          type: 'header',
          data: { text: 'Hidden', level: 2 },
          tunes: { privateAccess: { isPrivate: true } },
        },
        {
          type: 'privateSectionPlaceholder',
          data: {
            blockCount: 1,
            wordCount: 1,
            assetCount: 0,
            assetTotalSize: 0,
          },
        },
        {
          type: 'privateSectionExpanded',
          data: {
            summary: {
              blockCount: 1,
              wordCount: 1,
              assetCount: 0,
              assetTotalSize: 0,
            },
            blocks: [header('Private details', 3)],
          },
        },
      ],
    };

    expect(buildContentHeadings(data, en.slugify)).toEqual([
      {
        title: 'Public',
        level: 2,
        id: 'public',
        href: '#public',
        path: '0',
      },
      { title: 'Hidden', level: 2, id: 'hidden', href: '#hidden', path: '1' },
      {
        title: 'Private details',
        level: 3,
        id: 'private-details',
        href: '#private-details',
        path: '3.0',
      },
    ]);
  });
});
