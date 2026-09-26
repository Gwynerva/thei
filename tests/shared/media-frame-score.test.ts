import { describe, expect, it } from 'vitest';
import {
  frameScore,
  VIDEO_PREVIEW_FRAME_POSITIONS,
} from '../../shared/media-frame-score';

/** A frame of one colour, or of two halves, as RGBA pixels. */
function frame(...colours: [number, number, number][]) {
  const pixels: number[] = [];
  for (let index = 0; index < 64; index++) {
    const [red, green, blue] = colours[index % colours.length]!;
    pixels.push(red, green, blue, 255);
  }
  return pixels;
}

describe('frame score', () => {
  it('prefers a colourful frame to a dark, a flat or a washed-out one', () => {
    const vivid = frameScore(frame([220, 40, 40], [40, 120, 230]), 4);
    expect(frameScore(frame([0, 0, 0]), 4)).toBe(0);
    expect(frameScore(frame([12, 8, 30]), 4)).toBeLessThan(vivid / 10);
    expect(frameScore(frame([128, 128, 128]), 4)).toBeLessThan(vivid / 4);
    expect(frameScore(frame([250, 250, 250]), 4)).toBeLessThan(vivid / 10);
  });

  it('still ranks black-and-white frames by how clear they are', () => {
    const flat = frameScore(frame([120, 120, 120]), 4);
    const contrasty = frameScore(frame([30, 30, 30], [220, 220, 220]), 4);
    expect(contrasty).toBeGreaterThan(flat);
  });

  it('reads RGB as well as RGBA and leaves transparent pixels out', () => {
    const rgba = frame([200, 60, 60]);
    const rgb = rgba.filter((_, index) => index % 4 !== 3);
    expect(frameScore(rgb, 3)).toBeCloseTo(frameScore(rgba, 4));
    const hidden = rgba.map((value, index) => (index % 4 === 3 ? 0 : value));
    expect(frameScore(hidden, 4)).toBe(0);
  });

  it('samples a video between its opening and its end', () => {
    expect(VIDEO_PREVIEW_FRAME_POSITIONS[0]).toBeGreaterThan(0);
    expect(VIDEO_PREVIEW_FRAME_POSITIONS.at(-1)).toBeLessThan(1);
  });
});
