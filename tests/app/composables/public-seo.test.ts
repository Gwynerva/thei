import { describe, expect, it } from 'vitest';
import {
  formatLifeSeoDate,
  serializeJsonLd,
} from '../../../app/composables/public-seo';

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
});
