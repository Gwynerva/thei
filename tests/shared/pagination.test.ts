import { describe, expect, it } from 'vitest';
import { buildPaginationControls } from '../../shared/pagination';

describe('pagination navigation', () => {
  it('can reach every page through the gaps in large ranges', () => {
    for (let page = 1; page <= 100; page++) {
      const controls = buildPaginationControls(page, 100);
      expect(controls[0]).toEqual({
        key: 'previous',
        kind: 'previous',
        page: page - 1,
        disabled: page === 1,
      });
      expect(controls.at(-1)).toEqual({
        key: 'next',
        kind: 'next',
        page: page + 1,
        disabled: page === 100,
      });
      expect(controls).toContainEqual({ key: page, kind: 'page', page });
    }
  });
  it('disables both arrows for an empty or one-page list', () => {
    for (const count of [0, 1]) {
      const controls = buildPaginationControls(1, count);
      expect(controls[0]).toHaveProperty('disabled', true);
      expect(controls.at(-1)).toHaveProperty('disabled', true);
    }
  });
});
