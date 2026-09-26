import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  SVG_BASE_DENSITY,
  svgDensityFor,
} from '../../../server/thei/assets/svg-density';

const svg = (width: number, height: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000"/></svg>`,
  );

describe('SVG density for a target size', () => {
  it('draws a small drawing at twice the target and a large one below its own size', async () => {
    expect(await svgDensityFor(svg(16, 16), 48)).toBeCloseTo(
      (SVG_BASE_DENSITY * 96) / 16,
    );
    expect(await svgDensityFor(svg(4000, 2000), 512)).toBeCloseTo(
      (SVG_BASE_DENSITY * 1024) / 4000,
    );
  });

  it('leaves anything that is not an SVG alone', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    expect(await svgDensityFor(png, 48)).toBeUndefined();
    expect(
      await svgDensityFor(Buffer.from('not an image'), 48),
    ).toBeUndefined();
  });
});
