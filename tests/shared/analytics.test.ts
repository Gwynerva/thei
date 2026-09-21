import { describe, expect, it } from 'vitest';
import {
  normalizeAnalyticsValue,
  normalizeSiteAnalytics,
  yandexMetrikaInlineScript,
} from '../../shared/analytics';

describe('normalizeAnalyticsValue', () => {
  it('accepts a plain identifier', () => {
    expect(normalizeAnalyticsValue('googleTagId', ' g-abc12345 ')).toBe(
      'G-ABC12345',
    );
    expect(normalizeAnalyticsValue('yandexMetrikaId', '12345678')).toBe(
      '12345678',
    );
    expect(normalizeAnalyticsValue('googleTagId', '')).toBe('');
  });

  it('lifts the identifier out of a pasted snippet', () => {
    expect(
      normalizeAnalyticsValue(
        'googleTagId',
        '<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC12345"></script>',
      ),
    ).toBe('G-ABC12345');
    expect(
      normalizeAnalyticsValue('yandexMetrikaId', "ym(98765432, 'init', {})"),
    ).toBe('98765432');
    expect(
      normalizeAnalyticsValue(
        'googleSiteVerification',
        '<meta name="google-site-verification" content="abc_DEF-12345" />',
      ),
    ).toBe('abc_DEF-12345');
  });

  it('rejects anything else', () => {
    expect(normalizeAnalyticsValue('googleTagId', 'nonsense')).toBeUndefined();
    expect(normalizeAnalyticsValue('yandexMetrikaId', '12')).toBeUndefined();
    expect(
      normalizeAnalyticsValue('yandexVerification', 'sh ort'),
    ).toBeUndefined();
  });
});

describe('normalizeSiteAnalytics', () => {
  it('fills in every field and rejects a bad one', () => {
    expect(normalizeSiteAnalytics(undefined)).toEqual({
      googleTagId: '',
      googleSiteVerification: '',
      yandexMetrikaId: '',
      yandexVerification: '',
    });
    expect(
      normalizeSiteAnalytics({ googleTagId: 'G-ABC12345' })?.googleTagId,
    ).toBe('G-ABC12345');
    expect(normalizeSiteAnalytics({ yandexMetrikaId: 'x' })).toBeUndefined();
  });
});

describe('yandexMetrikaInlineScript', () => {
  it('starts the counter deferred, so navigation is reported by hand', () => {
    const script = yandexMetrikaInlineScript('12345678');
    expect(script).toContain('mc.yandex.ru/metrika/tag.js');
    expect(script).toContain("ym(12345678,'init',{defer:true");
  });
});
