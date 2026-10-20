import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatSnippet,
  searchFindPlace,
} from '../../../app/composables/search-ui';
import ru from '../../../shared/language/list/ru';

const typeset = (text: string) => ru.normalize(text);

describe('a snippet of a find', () => {
  it('is formatted as one text across its marks', () => {
    expect(
      formatSnippet(
        [
          { text: 'Проект "' },
          { text: 'Маяк', mark: true },
          { text: '" готов' },
        ],
        typeset,
      ),
    ).toEqual([
      { text: 'Проект \u00AB' },
      { text: 'Маяк', mark: true },
      { text: '\u00BB готов' },
    ]);
  });

  it('binds a short word to the found one after it', () => {
    expect(
      formatSnippet(
        [{ text: 'Шила в ' }, { text: 'мастерской', mark: true }],
        typeset,
      ),
    ).toEqual([{ text: 'Шила в\u00A0' }, { text: 'мастерской', mark: true }]);
  });

  it('keeps every mark, and loses no words', () => {
    const segments = [
      { text: '…и ' },
      { text: 'рога', mark: true as const },
      { text: ' с ' },
      { text: 'париком', mark: true as const },
      { text: '...' },
    ];
    const formatted = formatSnippet(segments, typeset);
    expect(formatted.filter((piece) => piece.mark)).toEqual([
      { text: 'рога', mark: true },
      { text: 'париком', mark: true },
    ]);
    expect(formatted.map((piece) => piece.text).join('')).toBe(
      '…и рога с\u00A0париком…',
    );
  });
});

describe('the place of a find', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('formats a name the owner gave, and shows another site’s as it is', () => {
    vi.stubGlobal('phrase', { value: { search_where: () => 'Link' } });
    vi.stubGlobal('publicText', (text: string) => `[${text}]`);
    const find = { where: 'link' as const, href: '/', segments: [] };
    expect(searchFindPlace({ ...find, label: 'Мой "код"' }).text).toBe(
      'Link · [Мой "код"]',
    );
    expect(
      searchFindPlace({ ...find, label: 'Lantern "Works"', labelAsIs: true })
        .text,
    ).toBe('Link · Lantern "Works"');
  });
});
