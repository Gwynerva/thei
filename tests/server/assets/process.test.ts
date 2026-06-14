import { describe, expect, it } from 'vitest';
import { processOriginalAsset } from '../../../server/thei/assets/process';

describe('original asset content validation', () => {
  it('rejects invalid image content even when the extension looks like an image', async () => {
    await expect(
      processOriginalAsset(Buffer.from('not an image'), 'png'),
    ).rejects.toThrow('Invalid image file');
  });

  it('rejects invalid video content even when the extension looks like a video', async () => {
    await expect(
      processOriginalAsset(Buffer.from('not a video'), 'mp4'),
    ).rejects.toThrow('Invalid video file');
  });
});
