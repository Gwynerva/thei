import { describe, expect, it } from 'vitest';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  ASSET_QUALITY_LEVELS,
  ASSET_QUALITY_STOPS,
  assetQualityLevelAt,
  assetQualityLevelOf,
  AVIF_QUALITY_BY_LEVEL,
  interpolateByQualityLevel,
  isAssetQualityStop,
  VIDEO_AUDIO_BITRATE_BY_LEVEL,
  VIDEO_BITRATE_FACTOR_BY_LEVEL,
} from '../../shared/asset-quality-levels';

describe('asset quality levels', () => {
  it('runs from minimal to maximum, with lossless as the stop past them', () => {
    expect(ASSET_QUALITY_LEVELS).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'maximum',
    ]);
    expect(ASSET_QUALITY_STOPS).toEqual([...ASSET_QUALITY_LEVELS, 'lossless']);
    expect(isAssetQualityStop('lossless')).toBe(true);
    expect(isAssetQualityStop('best')).toBe(false);
  });

  it('stands for stored qualities that rise with the level', () => {
    const qualities = ASSET_QUALITY_LEVELS.map(
      (level) => ASSET_QUALITY_LEVEL_QUALITY[level],
    );
    expect(qualities).toEqual([...qualities].sort((a, b) => a - b));
    for (const table of [
      AVIF_QUALITY_BY_LEVEL,
      VIDEO_BITRATE_FACTOR_BY_LEVEL,
      VIDEO_AUDIO_BITRATE_BY_LEVEL,
    ]) {
      const values = ASSET_QUALITY_LEVELS.map((level) => table[level]);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
  });

  it('finds the nearest level for a quality from an older version', () => {
    expect(assetQualityLevelOf(85)).toBe('high');
    expect(assetQualityLevelOf(80)).toBe('medium');
    expect(assetQualityLevelOf(100)).toBe('maximum');
    expect(assetQualityLevelOf(10)).toBe('minimal');
    // Halfway between low (60) and medium (75) goes up.
    expect(assetQualityLevelOf(67.5)).toBe('medium');
    expect(assetQualityLevelAt(90)).toBe('high');
    expect(assetQualityLevelAt(85)).toBeUndefined();
  });

  it('reads a table exactly at a level and along a line between two', () => {
    const table = { minimal: 0, low: 10, medium: 20, high: 30, maximum: 40 };
    expect(interpolateByQualityLevel(table, 75)).toBe(20);
    expect(interpolateByQualityLevel(table, 82.5)).toBe(25);
    expect(interpolateByQualityLevel(table, 10)).toBe(0);
    expect(interpolateByQualityLevel(table, 100)).toBe(40);
  });
});
