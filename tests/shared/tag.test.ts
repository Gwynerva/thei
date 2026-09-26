import { describe, expect, it } from 'vitest';
import {
  cleanTagTitle,
  matchedTagSynonym,
  normalizeTagEditItems,
  normalizeTagSynonyms,
  normalizeTagTitle,
  rankTagSearch,
  tagAccent,
  tagAccentCssColor,
  tagNamedBy,
  validateTagData,
} from '../../shared/tag';

describe('tags', () => {
  it('normalizes case, Unicode compatibility forms and ё', () => {
    expect(normalizeTagTitle('  Ｖｕｅ.JS  ')).toBe('vue.js');
    expect(normalizeTagTitle('Ёлка')).toBe(normalizeTagTitle('елка'));
  });

  it('accepts punctuation in titles and validates identity fields', () => {
    expect(
      validateTagData({
        title: 'C++, .NET & APIs',
        slug: 'cpp-dotnet-apis',
        publicId: 'Tag123',
        description: '  Tools  ',
      }),
    ).toMatchObject({
      title: 'C++, .NET & APIs',
      description: 'Tools',
    });
  });

  it('rejects malformed data and bounded fields', () => {
    expect(validateTagData(undefined)).toBe('Invalid tag data');
    expect(
      validateTagData({
        title: 'x'.repeat(101),
        slug: 'tag',
        publicId: 'Tag123',
        description: '',
      }),
    ).toBe('Tag title is too long');
    expect(
      validateTagData({
        title: 'Tag',
        slug: 'tag',
        publicId: 'Tag123',
        description: 'x'.repeat(2_001),
      }),
    ).toBe('Tag description is too long');
    expect(
      validateTagData({
        title: 'Tag',
        slug: 'tag',
        publicId: 'Tag123',
        description: '',
        iconAssetUuid: 'not-an-asset',
      }),
    ).toBe('Invalid icon asset ID');
  });

  it('collapses whitespace inside a title', () => {
    expect(cleanTagTitle('  Product \t  design ')).toBe('Product design');
  });

  it('cleans the tags of an entity and refuses two naming one tag', () => {
    const fail = (message: string): never => {
      throw new Error(message);
    };
    expect(
      normalizeTagEditItems(
        [
          { title: '  Product   design ' },
          { tagUuid: 't-1', title: 'Vue', slug: 'vue', publicId: 'vue' },
        ],
        fail,
      ),
    ).toEqual([
      { title: 'Product design' },
      { tagUuid: 't-1', title: 'Vue', slug: 'vue', publicId: 'vue' },
    ]);
    expect(() =>
      normalizeTagEditItems(
        [{ title: 'Product design' }, { title: 'product  DESIGN' }],
        fail,
      ),
    ).toThrow('Duplicate tag');
    expect(() =>
      normalizeTagEditItems(
        [
          { tagUuid: 't-1', title: 'Old', slug: 'old', publicId: 'old' },
          { tagUuid: 't-1', title: 'New', slug: 'new', publicId: 'new' },
        ],
        fail,
      ),
    ).toThrow('Duplicate tag');
    expect(() =>
      normalizeTagEditItems([{ title: 'x'.repeat(101) }], fail),
    ).toThrow('Tag title is too long');
    expect(normalizeTagEditItems(undefined, fail)).toBeUndefined();
  });

  it('ranks title before publicId and slug', () => {
    const ranked = rankTagSearch(
      [
        { title: 'Other', publicId: 'vue', slug: 'other' },
        { title: 'Vue', publicId: 'other', slug: 'other-2' },
        { title: 'Third', publicId: 'third', slug: 'vue' },
      ],
      'vue',
    );
    expect(ranked.map((tag) => tag.title)).toEqual(['Vue', 'Other', 'Third']);
  });
});

describe('tag accent', () => {
  it('prefers the icon accent and otherwise derives one from the title', () => {
    const fromIcon = tagAccent({
      title: 'Design',
      iconMedia: { accent: { hue: 210, chroma: 0.09 } },
    });
    expect(fromIcon).toEqual({ hue: 210, chroma: 0.09 });

    // Deterministic, and the same title always lands on the same hue.
    const derived = tagAccent({ title: 'Design' });
    expect(derived).toEqual(tagAccent({ title: 'Design' }));
    expect(derived.hue).not.toBe(tagAccent({ title: 'Research' }).hue);
    expect(tagAccentCssColor({ title: 'Design' })).toContain(
      String(derived.hue),
    );
  });
});

describe('tag synonyms', () => {
  const tag = {
    title: 'Образы Петры',
    publicId: 'obrazy',
    slug: 'obrazy-petry',
    synonyms: ['грим', 'косплей'],
  };

  it('cleans, splits and deduplicates synonyms and leaves out the title', () => {
    expect(
      normalizeTagSynonyms(
        ['  Грим ', 'макияж, КОСПЛЕЙ; грим', 'образы петры', ''],
        'Образы Петры',
      ),
    ).toEqual(['Грим', 'макияж', 'КОСПЛЕЙ']);
    expect(normalizeTagSynonyms(undefined, 'Tag')).toEqual([]);
    expect(normalizeTagSynonyms('грим', 'Tag')).toBe('Invalid synonyms');
    expect(normalizeTagSynonyms(['x'.repeat(101)], 'Tag')).toBe(
      'Tag synonym is too long',
    );
    expect(
      normalizeTagSynonyms(
        Array.from({ length: 21 }, (_, index) => `word ${index}`),
        'Tag',
      ),
    ).toBe('Too many tag synonyms');
  });

  it('keeps synonyms through validation', () => {
    expect(
      validateTagData({
        title: 'Образы Петры',
        slug: 'obrazy',
        publicId: 'Tag123',
        description: '',
        synonyms: ['грим', 'грим'],
      }),
    ).toMatchObject({ synonyms: ['грим'] });
  });

  it('finds a tag by a synonym and says which one', () => {
    const other = { title: 'Гримёрка', publicId: 'grim', slug: 'grimerka' };
    // A synonym typed whole ranks above a title that only begins with it.
    expect(
      rankTagSearch([other, tag], 'грим').map((item) => item.title),
    ).toEqual(['Образы Петры', 'Гримёрка']);
    expect(matchedTagSynonym(tag, 'КОСП')).toBe('косплей');
    expect(matchedTagSynonym(tag, 'образ')).toBeUndefined();
    expect(tagNamedBy(tag, ' Грим ')).toBe(true);
    expect(tagNamedBy(tag, 'гри')).toBe(false);
  });

  it('reads ё as е in search', () => {
    expect(
      rankTagSearch(
        [{ title: 'Ёлка', publicId: 'yolka', slug: 'yolka' }],
        'елк',
      ),
    ).toHaveLength(1);
  });
});
