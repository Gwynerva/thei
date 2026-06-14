import { describe, expect, it } from 'vitest';
import { assetUsageIsPrivate } from '../../../server/thei/assets/access';

describe('asset access guard', () => {
  it('treats only role metadata access private as private', () => {
    expect(
      assetUsageIsPrivate({
        role: 'showcase-asset',
        order: 0,
        access: 'private',
      }),
    ).toBe(true);
    expect(
      assetUsageIsPrivate({
        role: 'other-asset',
        order: 0,
        access: 'project',
      }),
    ).toBe(false);
    expect(assetUsageIsPrivate({ role: 'preview' })).toBe(false);
    expect(assetUsageIsPrivate(null)).toBe(false);
  });
});
