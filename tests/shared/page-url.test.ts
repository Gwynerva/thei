import { describe, expect, it } from 'vitest';
import { buildPageUrl } from '../../shared/page-url';

describe('page URL', () => {
  it('uses the unique slug without a generated public ID', () => {
    expect(buildPageUrl('about')).toBe('/pages/about/');
  });
});
