import { describe, expect, test } from 'vitest';
import {
  buildCompareMediaLayout,
  compareFitZoomTarget,
  compareSideZoomTarget,
  compareZoomPercent,
  getCompareSideMetrics,
  pickCompareNavigationDimensions,
  pickSeamlessCompareBaseDimensions,
} from '../../../../app/modals/asset-modal/compare-media';

describe('compare media layout', () => {
  test('uses a navigation plane that contains both files', () => {
    const original = { width: 800, height: 600 };
    const modified = { width: 1600, height: 1200 };

    expect(pickCompareNavigationDimensions(original, modified)).toEqual(
      modified,
    );
    expect(buildCompareMediaLayout(original, modified, 'real')).toEqual({
      base: modified,
      originalScale: 1,
      modifiedScale: 1,
    });
  });

  test('keeps each side at its real relative size', () => {
    const original = { width: 1200, height: 500 };
    const modified = { width: 800, height: 900 };

    expect(pickCompareNavigationDimensions(original, modified)).toEqual({
      width: 1200,
      height: 900,
    });
    expect(buildCompareMediaLayout(original, modified, 'real')).toEqual({
      base: { width: 1200, height: 900 },
      originalScale: 1,
      modifiedScale: 1,
    });
  });

  test('seamless mode normalizes the bigger file to the smaller base', () => {
    const original = { width: 800, height: 600 };
    const modified = { width: 1600, height: 1200 };

    expect(pickSeamlessCompareBaseDimensions(original, modified)).toBe(
      original,
    );
    expect(buildCompareMediaLayout(original, modified, 'seamless')).toEqual({
      base: original,
      originalScale: 1,
      modifiedScale: 0.5,
    });
  });

  test('reports side-relative zoom percentages', () => {
    expect(compareZoomPercent(0.5, 1)).toBe(50);
    expect(compareZoomPercent(1, 1)).toBe(100);
    expect(compareZoomPercent(1.25, 1)).toBe(125);
  });

  test('calculates the shared zoom target for each side at 100%', () => {
    expect(compareSideZoomTarget(1)).toBe(1);
  });

  test('calculates side metrics from the active compare layout', () => {
    const layout = buildCompareMediaLayout(
      { width: 800, height: 600 },
      { width: 1600, height: 1200 },
      'seamless',
    );

    expect(
      getCompareSideMetrics(layout, 'modified', {
        width: 1600,
        height: 1200,
      }),
    ).toEqual({
      scale: 0.5,
      width: 800,
      height: 600,
    });
  });

  test('calculates capped and uncapped fit targets for a side', () => {
    const metrics = { scale: 0.5, width: 800, height: 600 };
    const container = { width: 2048, height: 2048 };

    expect(compareFitZoomTarget(metrics, container, 48, true)).toBe(2);
    expect(compareFitZoomTarget(metrics, container, 48, false)).toBe(2.5);
  });
});
