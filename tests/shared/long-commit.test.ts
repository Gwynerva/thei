import { describe, expect, it } from 'vitest';
import {
  createFileZipSettings,
  createOriginalAssetSettings,
  isLongCommit,
} from '../../shared/asset-upload-settings';

describe('isLongCommit', () => {
  it('runs a video or audio encode or a zip as a job, and the rest in the request', () => {
    expect(
      isLongCommit({
        type: 'video-transform',
        quality: 75,
        dimensions: {},
        stripAudio: false,
        fastConversion: true,
      }),
    ).toBe(true);
    expect(isLongCommit(createFileZipSettings())).toBe(true);
    expect(
      isLongCommit({ type: 'audio-transform', quality: 75, mono: false }),
    ).toBe(true);
    expect(
      isLongCommit({ type: 'image-transform', quality: 75, dimensions: {} }),
    ).toBe(false);
    expect(isLongCommit(createOriginalAssetSettings())).toBe(false);
  });
});
