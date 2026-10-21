import { describe, expect, it } from 'vitest';
import { cropKey, cropName } from './crops';

describe('a close-up of the probe', () => {
  it('is named by its step, its rule and the start of its hash', () => {
    expect(cropName(2, 'covered-control:9a0ru8lznl')).toBe(
      '02-covered-control-9a0ru8lz.png',
    );
    expect(cropName(12, 'clipped-text:25cq6m31ilk')).toBe(
      '12-clipped-text-25cq6m31.png',
    );
  });

  it('tells apart two findings of one rule on one step', () => {
    expect(cropKey('overlap:aaaa1111')).not.toBe(cropKey('overlap:bbbb2222'));
  });

  it('stays a safe file name whatever the fingerprint holds', () => {
    expect(cropKey('a1f04c2e9b7d4410')).toBe('a1f04c2e');
    expect(cropKey('odd rule:x/y\\z:w')).toBe('odd-rule-x-y-z-w');
  });
});
