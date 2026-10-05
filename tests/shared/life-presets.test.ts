import { describe, expect, it } from 'vitest';
import { lifePreset, lifePresetHref } from '../../shared/life-presets';

describe('life presets', () => {
  it('recognises the diary as a destination of its own', () => {
    const preset = lifePreset(['diary-entry']);
    expect(preset?.id).toBe('diary');
    expect(lifePresetHref(preset!)).toBe('/life/?f=diary-entry');
  });

  it('treats any other filter as a way of reading the feed', () => {
    expect(lifePreset(undefined)).toBeUndefined();
    expect(lifePreset(['event'])).toBeUndefined();
    expect(lifePreset(['diary-entry', 'event'])).toBeUndefined();
  });
});
