import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  isVersion,
  newestVersion,
  normalizeVersion,
  parseVersion,
} from '../../update/semver';

describe('update semver', () => {
  it('parses plain and prefixed versions', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    });
    expect(parseVersion('v1.2.3')?.major).toBe(1);
    expect(parseVersion('1.2.3-beta.2')?.prerelease).toEqual(['beta', 2]);
    expect(parseVersion('1.2.3+build.5')?.prerelease).toEqual([]);
  });

  it('rejects anything that is not a release', () => {
    for (const value of ['', 'latest', '1.2', 'v1', 'nightly-2026']) {
      expect(isVersion(value)).toBe(false);
    }
  });

  it('normalizes to a bare version', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('v1.2.3+meta')).toBe('1.2.3');
    expect(normalizeVersion('v1.2.3-rc.1')).toBe('1.2.3-rc.1');
  });

  it('orders releases', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });

  it('orders a prerelease before its release', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBeLessThan(0);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.1.1')).toBeLessThan(0);
  });

  it('picks the newest version and ignores noise', () => {
    expect(
      newestVersion(['v0.9.0', 'latest', 'v1.2.0', 'v1.10.0', 'broken']),
    ).toBe('v1.10.0');
    expect(newestVersion(['not-a-version'])).toBeUndefined();
    expect(newestVersion([])).toBeUndefined();
  });

  it('prefers a stable release over its own prerelease', () => {
    expect(newestVersion(['v1.0.0-rc.1', 'v1.0.0'])).toBe('v1.0.0');
  });
});
