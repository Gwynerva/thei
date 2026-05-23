import sharp from 'sharp';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-profiles';

export async function processAsset(
  inputBuffer: Buffer,
  profile: AssetUploadProfile,
  originalExtension: string,
): Promise<{ buffer: Buffer; extension: string }> {
  if (!profile.process) {
    return { buffer: inputBuffer, extension: originalExtension };
  }
  const opts = profile.process;
  switch (opts.format) {
    case 'webp': {
      const { quality, effort, resize } = opts;
      let pipeline = sharp(inputBuffer);
      if (resize) {
        pipeline = pipeline.resize(resize.width, resize.height, {
          fit: resize.fit,
        });
      }
      const buffer = await pipeline
        .webp({ quality, ...(effort !== undefined && { effort }) })
        .toBuffer();
      return { buffer, extension: 'webp' };
    }
    case 'mp4': {
      throw new Error('MP4 processing not yet implemented');
    }
  }
}
