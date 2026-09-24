import { describe, expect, it } from 'vitest';
import {
  centeredCropRect,
  clampCropRect,
  cropFractionToRect,
  cropRectToFraction,
  evenCropRect,
  maximizeCropRect,
  moveCropRect,
  reshapeCropRect,
  resizeCropRect,
  rotateCropFraction,
  rotatedDimensions,
} from '../../../shared/asset-crop';

const photo = { width: 4000, height: 3000 };

describe('crop geometry', () => {
  it('centres the largest crop of an aspect', () => {
    expect(centeredCropRect(photo, 1)).toEqual({
      left: 500,
      top: 0,
      width: 3000,
      height: 3000,
    });
    expect(centeredCropRect(photo, 16 / 9)).toEqual({
      left: 0,
      top: 375,
      width: 4000,
      height: 2250,
    });
  });

  it('converts between fractions and pixels without losing an edge', () => {
    const crop = { left: 400, top: 300, width: 3200, height: 1800 };
    expect(cropFractionToRect(cropRectToFraction(crop, photo), photo)).toEqual(
      crop,
    );
    // A crop reaching the far edge still reaches it at another size.
    const toEdge = cropRectToFraction(
      { left: 1000, top: 0, width: 3000, height: 3000 },
      photo,
    );
    expect(cropFractionToRect(toEdge, { width: 1333, height: 1000 })).toEqual({
      left: 333,
      top: 0,
      width: 1000,
      height: 1000,
    });
  });

  it('clamps a crop into the source', () => {
    expect(
      clampCropRect({ left: -10, top: 2990, width: 50, height: 50 }, photo),
    ).toEqual({ left: 0, top: 2990, width: 50, height: 10 });
  });

  it('moves a crop without letting it leave the source', () => {
    const start = { left: 100, top: 100, width: 1000, height: 1000 };
    expect(moveCropRect(start, -500, 5000, photo)).toEqual({
      left: 0,
      top: 2000,
      width: 1000,
      height: 1000,
    });
  });

  it('resizes from a corner, keeping the opposite corner in place', () => {
    const start = { left: 1000, top: 1000, width: 1000, height: 1000 };
    expect(resizeCropRect(start, 'nw', -200, -100, photo)).toEqual({
      left: 800,
      top: 900,
      width: 1200,
      height: 1100,
    });
  });

  it('keeps the aspect from a corner, following the larger movement', () => {
    const start = { left: 1000, top: 1000, width: 1600, height: 900 };
    const resized = resizeCropRect(start, 'se', 10, 450, photo, 16 / 9);
    expect(resized.height).toBeCloseTo(1350);
    expect(resized.width).toBeCloseTo(2400);
    expect(resized.left).toBe(1000);
    expect(resized.top).toBe(1000);
  });

  it('stops an aspect crop at the edge of the source', () => {
    const start = { left: 3000, top: 2000, width: 800, height: 800 };
    const resized = resizeCropRect(start, 'se', 5000, 5000, photo, 1);
    expect(resized).toEqual({
      left: 3000,
      top: 2000,
      width: 1000,
      height: 1000,
    });
  });

  it('never shrinks below a few pixels', () => {
    const start = { left: 100, top: 100, width: 200, height: 200 };
    const resized = resizeCropRect(start, 'e', -1000, 0, photo);
    expect(resized.width).toBe(16);
    expect(resized.left).toBe(100);
  });

  it('reshapes around the centre and fits back inside', () => {
    const reshaped = reshapeCropRect(
      { left: 0, top: 0, width: 4000, height: 3000 },
      photo,
      16 / 9,
    );
    expect(reshaped.width / reshaped.height).toBeCloseTo(16 / 9);
    expect(reshaped.width).toBeLessThanOrEqual(4000);
    expect(reshaped.top + reshaped.height).toBeLessThanOrEqual(3000);
  });

  it('maximizes to the whole source without an aspect', () => {
    expect(maximizeCropRect(photo)).toEqual({ left: 0, top: 0, ...photo });
  });

  it('moves every video crop edge onto an even pixel', () => {
    expect(
      evenCropRect({ left: 11, top: 5, width: 1201, height: 675 }, photo),
    ).toEqual({ left: 10, top: 4, width: 1200, height: 674 });
  });

  it('swaps the sides of a quarter turn only', () => {
    expect(rotatedDimensions(photo, 90)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedDimensions(photo, 180)).toEqual(photo);
    expect(rotatedDimensions(photo, 270)).toEqual({
      width: 3000,
      height: 4000,
    });
  });

  it('keeps framing the same part of a picture turned clockwise', () => {
    // The top-left quarter of a picture lies top-right once it is turned.
    const turned = rotateCropFraction({
      left: 0,
      top: 0,
      width: 0.5,
      height: 0.5,
    });
    expect(turned).toEqual({ left: 0.5, top: 0, width: 0.5, height: 0.5 });
    // Four quarter turns are no turn at all.
    const strip = { left: 0.1, top: 0.2, width: 0.3, height: 0.4 };
    let back = strip;
    for (let turn = 0; turn < 4; turn++) back = rotateCropFraction(back);
    expect(back.left).toBeCloseTo(strip.left);
    expect(back.top).toBeCloseTo(strip.top);
    expect(back.width).toBeCloseTo(strip.width);
    expect(back.height).toBeCloseTo(strip.height);
  });
});
