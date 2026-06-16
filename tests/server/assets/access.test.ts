import { describe, expect, it } from 'vitest';
import { assetUsageIsPrivate } from '../../../server/thei/assets/access';

describe('asset access guard', () => {
  it('treats role metadata isPrivate as private', () => {
    expect(
      assetUsageIsPrivate({
        role: 'showcase-asset',
        order: 0,
        isPrivate: true,
      }),
    ).toBe(true);
    expect(
      assetUsageIsPrivate({
        role: 'other-asset',
        order: 0,
        isPrivate: false,
      }),
    ).toBe(false);
    expect(assetUsageIsPrivate({ role: 'preview' })).toBe(false);
    expect(assetUsageIsPrivate(null)).toBe(false);
  });
});
