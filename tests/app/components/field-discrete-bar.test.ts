import { describe, expect, it } from 'vitest';
import {
  compactSize,
  nearestStopIndex,
  steppedIndex,
  stopPosition,
  trackInset,
  trackPosition,
} from '../../../app/components/field/discrete-bar';

describe('discrete bar geometry', () => {
  it('puts each stop at the centre of its column', () => {
    expect(stopPosition(0, 4)).toBe(12.5);
    expect(stopPosition(3, 4)).toBe(87.5);
    expect(trackInset(4)).toBe(12.5);
    expect(trackPosition(0, 4)).toBe(0);
    expect(trackPosition(3, 4)).toBe(100);
    expect(trackPosition(0, 1)).toBe(0);
  });

  it('picks the column a pointer lands in', () => {
    expect(nearestStopIndex(0, 300, 6)).toBe(0);
    expect(nearestStopIndex(49, 300, 6)).toBe(0);
    expect(nearestStopIndex(51, 300, 6)).toBe(1);
    expect(nearestStopIndex(299, 300, 6)).toBe(5);
    // Past either edge still lands on the end stops.
    expect(nearestStopIndex(-20, 300, 6)).toBe(0);
    expect(nearestStopIndex(400, 300, 6)).toBe(5);
    expect(nearestStopIndex(10, 0, 6)).toBe(0);
  });

  it('walks the stops from the keyboard and stays on the track', () => {
    expect(steppedIndex(2, 'ArrowRight', 6)).toBe(3);
    expect(steppedIndex(2, 'ArrowUp', 6)).toBe(3);
    expect(steppedIndex(2, 'ArrowLeft', 6)).toBe(1);
    expect(steppedIndex(2, 'ArrowDown', 6)).toBe(1);
    expect(steppedIndex(0, 'ArrowLeft', 6)).toBe(0);
    expect(steppedIndex(5, 'ArrowRight', 6)).toBe(5);
    expect(steppedIndex(2, 'Home', 6)).toBe(0);
    expect(steppedIndex(2, 'End', 6)).toBe(5);
    expect(steppedIndex(4, 'PageUp', 6)).toBe(5);
    expect(steppedIndex(1, 'PageDown', 6)).toBe(0);
    expect(steppedIndex(2, 'Enter', 6)).toBeUndefined();
  });
});

describe('compact size', () => {
  const units = { b: 'bytes', kb: 'Kb', mb: 'Mb', gb: 'Gb' };

  it('gives each size its own unit and a whole number, rounded up', () => {
    expect(compactSize(900 * 1024, units)).toBe('900 Kb');
    expect(compactSize(2.15 * 1024 * 1024, units)).toBe('3 Mb');
    expect(compactSize(12.44 * 1024 * 1024, units)).toBe('13 Mb');
    expect(compactSize(128.6 * 1024 * 1024, units)).toBe('129 Mb');
    expect(compactSize(9_990, units)).toBe('10 Kb');
    expect(compactSize(512, units)).toBe('512 bytes');
    expect(compactSize(1.5 * 1024 ** 3, units)).toBe('2 Gb');
  });
});
