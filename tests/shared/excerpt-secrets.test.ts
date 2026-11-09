import { describe, expect, it } from 'vitest';
import { placeExcerptSecrets } from '../../shared/excerpt-secrets';

describe('placeExcerptSecrets', () => {
  it('puts each codename where it stands among the readable ones', () => {
    const placed = placeExcerptSecrets(
      ['a', 'b'],
      [
        { key: 'first', before: 0 },
        { key: 'middle', before: 1 },
        { key: 'next to it', before: 1 },
        { key: 'last', before: 2 },
      ],
    );
    expect(
      placed.map((item) => (item.secret ? item.excerpt.key : item.excerpt)),
    ).toEqual(['first', 'a', 'middle', 'next to it', 'b', 'last']);
  });

  it('keeps codenames of a parent nothing of which is readable', () => {
    const placed = placeExcerptSecrets(
      [],
      [
        { key: 'one', before: 0 },
        { key: 'two', before: 0 },
      ],
    );
    expect(placed).toEqual([
      { secret: true, excerpt: { key: 'one', before: 0 } },
      { secret: true, excerpt: { key: 'two', before: 0 } },
    ]);
  });
});
