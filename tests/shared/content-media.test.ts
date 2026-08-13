import { describe, expect, it } from 'vitest';
import {
  CONTENT_MEDIA_AUTOPLAY_MAX_BYTES,
  contentMediaAutoplays,
} from '../../shared/content-media';

describe('content media playback policy', () => {
  it('autoplays only known files up to and including 30 MiB', () => {
    expect(contentMediaAutoplays(CONTENT_MEDIA_AUTOPLAY_MAX_BYTES - 1)).toBe(
      true,
    );
    expect(contentMediaAutoplays(CONTENT_MEDIA_AUTOPLAY_MAX_BYTES)).toBe(true);
    expect(contentMediaAutoplays(CONTENT_MEDIA_AUTOPLAY_MAX_BYTES + 1)).toBe(
      false,
    );
    expect(contentMediaAutoplays(undefined)).toBe(false);
  });
});
