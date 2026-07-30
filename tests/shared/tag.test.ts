import { describe, expect, it } from 'vitest';
import {
  normalizeTagTitle,
  rankTagSearch,
  rankTagRecommendations,
  validateTagData,
} from '../../shared/tag';

describe('tags', () => {
  it('normalizes case and Unicode compatibility forms', () => {
    expect(normalizeTagTitle('  Ｖｕｅ.JS  ')).toBe('vue.js');
  });

  it('accepts punctuation in titles and validates identity fields', () => {
    expect(
      validateTagData({
        title: 'C++, .NET & APIs',
        slug: 'cpp-dotnet-apis',
        publicId: 'Tag123',
        description: '  Tools  ',
        accentColor: '#12aBcD',
      }),
    ).toMatchObject({
      title: 'C++, .NET & APIs',
      description: 'Tools',
      accentColor: '#12aBcD',
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

  it('recommends text matches and tags used together at least four times', () => {
    const tags = [
      { tagUuid: 'vue', title: 'Vue' },
      { tagUuid: 'design', title: 'Product design' },
      { tagUuid: 'rare', title: 'Rare' },
    ];
    expect(
      rankTagRecommendations(
        tags,
        'A product design case',
        new Map([
          ['vue', 4],
          ['rare', 3],
        ]),
      ).map((tag) => tag.tagUuid),
    ).toEqual(['design', 'vue']);
  });
});
