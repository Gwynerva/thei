import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { extractImageAccent } from '../../../server/thei/assets/image-color';

function image(fill: string, detail = '') {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="${fill}" d="M0 0h100v100H0z"/>${detail}</svg>`,
  );
}

describe('image accent', () => {
  it('finds visible color through transparent padding', async () => {
    const source = image(
      'none',
      '<circle cx="50" cy="50" r="14" fill="#168de2"/>',
    );
    const accent = await extractImageAccent(source);
    expect(accent?.hue).toBeGreaterThan(220);
    expect(accent?.hue).toBeLessThan(280);
    expect(accent?.chroma).toBeGreaterThan(0.1);
  });

  it('selects a cluster instead of cancelling opposing hues', async () => {
    const accent = await extractImageAccent(
      image('#e33', '<path fill="#25cfe0" d="M0 0h50v100H0z"/>'),
    );
    const hue = accent!.hue;
    expect(hue < 45 || hue > 330 || (hue > 175 && hue < 230)).toBe(true);
    expect(accent!.chroma).toBeGreaterThan(0.1);
  });

  it.each(['#fff', '#000', '#777'])(
    'keeps %s neutral even with a small bright detail',
    async (fill) => {
      expect(await extractImageAccent(image(fill))).toEqual({
        hue: 0,
        chroma: 0,
      });
      expect(
        await extractImageAccent(
          image(fill, '<path fill="red" d="M0 0h10v10H0z"/>'),
        ),
      ).toEqual({ hue: 0, chroma: 0 });
    },
  );

  it('retains low saturation rather than amplifying it', async () => {
    const muted = await extractImageAccent(image('#81949c'));
    const vivid = await extractImageAccent(image('#008fce'));
    expect(muted!.chroma).toBeGreaterThan(0.018);
    expect(muted!.chroma).toBeLessThan(vivid!.chroma);
    expect(muted!.chroma).toBeLessThan(0.05);
  });

  it('smoothly gains chroma between 20% and 40% visible color', async () => {
    const colors = await Promise.all(
      [19, 20, 21, 30, 39, 40, 41].map((percent) =>
        extractImageAccent(
          image('#fff', `<path fill="#168de2" d="M0 0h${percent}v100H0z"/>`),
        ),
      ),
    );
    expect(colors[0]).toEqual({ hue: 0, chroma: 0 });
    expect(colors[1]).toEqual({ hue: 0, chroma: 0 });
    expect(colors[2]!.chroma).toBeLessThan(0.003);
    expect(colors[3]!.chroma).toBeGreaterThan(colors[2]!.chroma);
    expect(colors[3]!.chroma).toBeLessThan(colors[4]!.chroma);
    expect(colors[5]!.chroma).toBeCloseTo(colors[6]!.chroma, 4);
  });

  it('omits a color when there are no visible pixels', async () => {
    expect(await extractImageAccent(image('none'))).toBeUndefined();
  });

  it('does not count added padding for a wide image', async () => {
    const source = await sharp({
      create: { width: 128, height: 8, channels: 3, background: '#168de2' },
    })
      .png()
      .toBuffer();
    expect((await extractImageAccent(source))!.chroma).toBeGreaterThan(0.1);
  });
});
