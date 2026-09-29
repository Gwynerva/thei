import { describe, expect, it } from 'vitest';
import type { MediaDescriptor } from '../../../shared/media';
import {
  formatLifeSeoDate,
  publicSeoImage,
  publicSeoTemporalCoverage,
  serializeJsonLd,
} from '../../../app/composables/public-seo';

const picture = (extra: Partial<MediaDescriptor> = {}): MediaDescriptor => ({
  src: '/events/moment-a1/content/photo.webp',
  previewSrc: '/events/moment-a1/content/photo-preview.webp',
  kind: 'image',
  ...extra,
});
const CARD = '/og/event/a1.png?v=1';

describe('public SEO helpers', () => {
  it('formats nested Life periods without a year suffix', () => {
    expect(formatLifeSeoDate('2027-04-06', 'ru')).toBe('6 апреля 2027');
    expect(formatLifeSeoDate('2027-04-06', 'en')).toBe('6 April 2027');
    expect(formatLifeSeoDate('2027-04', 'ru')).toBeUndefined();
    expect(formatLifeSeoDate(undefined, 'ru')).toBeUndefined();
  });

  it('serializes JSON-LD without allowing a closing script tag', () => {
    expect(serializeJsonLd({ name: '</script>' })).toContain('\\u003c/script>');
  });

  it('offers only a picture of the entity itself, or else the card', () => {
    expect(publicSeoImage(picture(), CARD)).toBe(picture().src);
    expect(publicSeoImage(picture({ width: 1600, height: 900 }), CARD)).toBe(
      picture().src,
    );
    // A video by its still frame.
    expect(publicSeoImage(picture({ kind: 'video' }), CARD)).toBe(
      picture().previewSrc,
    );
    // Neither a drawn placeholder nor an icon too small to show.
    expect(publicSeoImage(picture({ generated: true }), CARD)).toBe(CARD);
    expect(publicSeoImage(picture({ width: 128, height: 128 }), CARD)).toBe(
      CARD,
    );
    expect(publicSeoImage(undefined, CARD)).toBe(CARD);
    expect(publicSeoImage(picture({ generated: true }))).toBeUndefined();
  });

  it('spells a period as one date or an ISO 8601 interval', () => {
    expect(
      publicSeoTemporalCoverage({
        startDate: '2026-01-10',
        endDate: '2026-01-10',
      }),
    ).toBe('2026-01-10');
    expect(
      publicSeoTemporalCoverage({
        startDate: '2026-01-10',
        endDate: '2026-01-12',
      }),
    ).toBe('2026-01-10/2026-01-12');
  });
});
