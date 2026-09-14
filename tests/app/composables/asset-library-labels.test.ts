import { describe, expect, it } from 'vitest';
import { assetPlacementContentContext } from '../../../app/composables/asset-library-labels';
import type {
  AssetPlacement,
  AssetSourceType,
} from '../../../shared/asset-library';

function placement(
  sourceType: AssetSourceType,
  scope: AssetPlacement['scope'] = { kind: 'entity' },
): AssetPlacement {
  return {
    source: {
      type: sourceType,
      id: sourceType,
      title: sourceType,
      summary: '',
      updatedAt: 0,
    },
    role: 'content',
    scope,
    isPrivate: false,
    count: 1,
  };
}

describe('assetPlacementContentContext', () => {
  it.each([
    ['project', 'project-description'],
    ['event', 'event-description'],
    ['page', 'page-content'],
    ['profile', 'profile-about'],
  ] as const)('describes root %s content', (source, expected) => {
    expect(assetPlacementContentContext(placement(source))).toBe(expected);
  });

  it.each(['project-stage', 'project-section'] as const)(
    'keeps nested %s content generic',
    (kind) => {
      expect(
        assetPlacementContentContext(
          placement('project', { kind, title: 'Child', url: '/child/' }),
        ),
      ).toBe('content');
    },
  );
});
