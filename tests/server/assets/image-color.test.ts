import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { extractImageAccentHue } from '../../../server/thei/assets/image-color';

describe('image accent hue', () => {
  it('finds a visible color through transparent padding', async () => {
    const source = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="14" fill="#168de2"/></svg>',
    );
    const hue = await extractImageAccentHue(source);
    expect(hue).toBeGreaterThan(220);
    expect(hue).toBeLessThan(280);
  });

  it('selects a color cluster instead of cancelling opposing hues', async () => {
    const source = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><path fill="#e33" d="M0 0h50v50H0z"/><path fill="#25cfe0" d="M50 0h50v50H50z"/></svg>',
    );
    const hue = await extractImageAccentHue(source);
    expect(hue).toBeTypeOf('number');
    expect(hue! < 45 || hue! > 330 || (hue! > 175 && hue! < 230)).toBe(true);
  });

  it('omits a hue for a truly neutral image', async () => {
    const source = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: '#777777',
      },
    })
      .png()
      .toBuffer();
    expect(await extractImageAccentHue(source)).toBeUndefined();
  });
});
