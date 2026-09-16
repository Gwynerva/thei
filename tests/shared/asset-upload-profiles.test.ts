import { describe, expect, it } from 'vitest';
import { getAssetUploadProfileAspect } from '../../shared/asset-upload-profiles';

describe('upload profile aspect hints', () => {
  it('describes the proportions of non-square slots', () => {
    expect(getAssetUploadProfileAspect('project-banner')).toEqual({
      ratio: '16:9',
      width: 1200,
      height: 675,
    });
    expect(getAssetUploadProfileAspect('profile-banner')).toEqual({
      ratio: '3:1',
      width: 1200,
      height: 400,
    });
    expect(
      getAssetUploadProfileAspect('project-action-background')?.ratio,
    ).toBe('8:3');
  });

  it('says nothing about square slots or a missing profile', () => {
    expect(getAssetUploadProfileAspect('project-icon')).toBeUndefined();
    expect(getAssetUploadProfileAspect('profile-avatar')).toBeUndefined();
    expect(getAssetUploadProfileAspect(undefined)).toBeUndefined();
  });
});
