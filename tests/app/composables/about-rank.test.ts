import { describe, expect, it } from 'vitest';
import { ABOUT_TOGETHER_RANK, NAME_RANKS } from '../../../shared/search/match';

/**
 * `foundByAbout` (`shared/admin/content-entity-search.ts`) takes a rank for
 * the `about` tier's by its bounds, so the rank of words answered only
 * together has to lie between them.
 */
describe('the rank of words an excerpt and its subject answer together', () => {
  it('lies inside the tier of what a thing is about', () => {
    const about = NAME_RANKS.about;
    expect(ABOUT_TOGETHER_RANK).toBeGreaterThan(about.words);
    expect(ABOUT_TOGETHER_RANK).toBeLessThan(about.inside);
    expect(ABOUT_TOGETHER_RANK).toBeGreaterThanOrEqual(about.exact);
  });

  it('is below every name of the thing’s own', () => {
    const own = [
      ...Object.values(NAME_RANKS.title),
      ...Object.values(NAME_RANKS.synonym),
    ];
    expect(ABOUT_TOGETHER_RANK).toBeGreaterThan(Math.max(...own));
  });
});
