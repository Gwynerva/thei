import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assetPlacementLabel,
  assetUseLabel,
} from '../../../app/composables/asset-library-labels';
import type {
  AssetPlacement,
  AssetSourceType,
} from '../../../shared/asset-library';

function placement(sourceType: AssetSourceType): AssetPlacement {
  return {
    source: {
      type: sourceType,
      id: sourceType,
      title: sourceType,
      summary: '',
      updatedAt: 0,
    },
    role: 'content',
    isPrivate: false,
    count: 1,
  };
}

beforeEach(() => {
  // Every phrase reads as its own key: the test names which one is said.
  vi.stubGlobal('phrase', {
    value: new Proxy({}, { get: (_target, key) => String(key) }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assetUseLabel', () => {
  it.each([
    ['project', 'asset_role_project_description'],
    ['event', 'asset_role_event_description'],
    ['page', 'asset_role_page_content'],
    ['profile', 'asset_role_profile_about'],
    ['project-section', 'asset_role_section_text'],
    ['excerpt', 'asset_role_excerpt_text'],
    ['diary-entry', 'asset_role_diary_text'],
    ['tag', 'asset_role_tag_description'],
    ['ai-session', 'asset_role_content'],
    ['unused', 'asset_role_content'],
  ] as const)(
    'names a file in the text of %s by whose text it is',
    (source, expected) => {
      expect(assetUseLabel('content', source)).toBe(expected);
      expect(assetPlacementLabel(placement(source))).toBe(expected);
    },
  );

  it('names any other use by its role, whatever the place', () => {
    expect(assetUseLabel('banner', 'project')).toBe('asset_role_banner');
    expect(
      assetPlacementLabel({ ...placement('project'), role: 'banner' }),
    ).toBe('asset_role_banner');
  });

  it('names a profile picture by what it is', () => {
    expect(
      assetPlacementLabel({
        ...placement('profile'),
        role: 'icon',
        detail: 'avatar',
      }),
    ).toBe('asset_role_avatar');
  });
});
