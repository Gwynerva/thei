import { describe, expect, it } from 'vitest';
import {
  formatLifeSeoPeriod,
  serializeJsonLd,
} from '../../../app/composables/public-seo';

describe('public SEO helpers', () => {
  it('formats nested Life periods without a year suffix', () => {
    expect(formatLifeSeoPeriod('2027', 'ru')).toBe('2027');
    expect(formatLifeSeoPeriod('2027-04', 'ru')).toBe('Апрель 2027');
    expect(formatLifeSeoPeriod('2027-04-06', 'ru')).toBe('6 апреля 2027');
    expect(formatLifeSeoPeriod('2027-04', 'en')).toBe('April 2027');
  });

  it('serializes JSON-LD without allowing a closing script tag', () => {
    expect(serializeJsonLd({ name: '</script>' })).toContain('\\u003c/script>');
  });
});
