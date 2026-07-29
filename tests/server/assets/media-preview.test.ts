import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AssetType } from '../../../shared/asset';
import {
  createMediaPreview,
  MEDIA_PREVIEW_MAX_LONG_SIDE,
  MEDIA_PREVIEW_WEBP_QUALITY,
} from '../../../server/thei/assets/media-preview';

describe('media previews', () => {
  it('keeps small image dimensions and produces WebP', async () => {
    const source = await sharp({
      create: {
        width: 320,
        height: 180,
        channels: 4,
        background: '#d93672',
      },
    })
      .png()
      .toBuffer();

    const preview = await createMediaPreview(source, AssetType.Image);
    const meta = await sharp(preview.buffer).metadata();

    expect(MEDIA_PREVIEW_WEBP_QUALITY).toBe(60);
    expect(preview).toMatchObject({ width: 320, height: 180 });
    expect(meta.format).toBe('webp');
  });

  it('limits the long side to 720 and preserves aspect ratio', async () => {
    const source = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: '#2474c8',
      },
    })
      .jpeg()
      .toBuffer();

    const preview = await createMediaPreview(source, AssetType.Image);

    expect(MEDIA_PREVIEW_MAX_LONG_SIDE).toBe(720);
    expect(preview).toMatchObject({ width: 720, height: 405 });
  });

  it('rasterizes SVG without enlarging its intrinsic size', async () => {
    const source = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="480"><rect width="240" height="480" fill="#63b33e"/></svg>',
    );

    const preview = await createMediaPreview(source, AssetType.Image);

    expect(preview).toMatchObject({ width: 240, height: 480 });
    expect((await sharp(preview.buffer).metadata()).format).toBe('webp');
  });
});
