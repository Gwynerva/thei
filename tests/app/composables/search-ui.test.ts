import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatSnippet,
  searchFindPlace,
  searchHitWhen,
  searchHitYears,
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

describe('the day of a result', () => {
  afterEach(() => vi.unstubAllGlobals());

  const hit = {
    ref: 'r',
    title: 'T',
    href: '/',
    finds: [],
    more: 0,
  };
  const entry = {
    type: 'diary-entry' as const,
    title: '',
    date: '2026-05-01',
    href: '/diary/2026-05-01/',
  };

  it('is not said again after a parent called by it', () => {
    vi.stubGlobal('language', { value: { code: 'en' } });
    const ofEntry = {
      ...hit,
      kind: 'excerpt' as const,
      date: '2026-05-01',
      parent: entry,
    };
    expect(searchHitWhen(ofEntry)).toBe('');
    expect(searchHitYears(ofEntry)).toBe('');
    expect(
      searchHitWhen({ ...hit, kind: 'diary-entry', date: '2026-05-01' }),
    ).toBe('');
  });

  it('is said of a part whose parent has a name of its own', () => {
    vi.stubGlobal('language', { value: { code: 'en' } });
    const ofEvent = {
      ...hit,
      kind: 'excerpt' as const,
      date: '2026-05-01',
      parent: { type: 'event' as const, title: 'Fair', href: '/events/fair/' },
    };
    expect(searchHitWhen(ofEvent)).toContain('2026');
    expect(searchHitYears(ofEvent)).toBe('2026');
  });

  it('is not taken for named when neither it nor its parent has a day', () => {
    vi.stubGlobal('language', { value: { code: 'en' } });
    const undated = {
      ...hit,
      kind: 'excerpt' as const,
      date: undefined,
      parent: { type: 'event' as const, title: 'Fair', href: '/events/fair/' },
    };
    expect(searchHitWhen(undated)).toBe('');
    expect(searchHitYears(undated)).toBe('');
  });
});
