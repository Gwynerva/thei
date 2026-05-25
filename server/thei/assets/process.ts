import sharp from 'sharp';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-profiles';

const SHARP_RASTER_EXTS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
]);

async function stripRasterMetadata(buf: Buffer, ext: string): Promise<Buffer> {
  const img = sharp(buf);
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return img.jpeg().toBuffer();
    case 'png':
      return img.png().toBuffer();
    case 'gif':
      return img.gif().toBuffer();
    case 'webp':
      return img.webp().toBuffer();
    case 'avif':
      return img.avif().toBuffer();
    default:
      return buf;
  }
}

// SVG is XML — strip the standardised <metadata> element which editors
// (Inkscape, Illustrator, etc.) use to embed author and document info.
function stripSvgMetadata(buf: Buffer): Buffer {
  const stripped = buf
    .toString('utf8')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  return Buffer.from(stripped, 'utf8');
}

export async function processAsset(
  inputBuffer: Buffer,
  profile: AssetUploadProfile,
  originalExtension: string,
): Promise<{ buffer: Buffer; extension: string }> {
  if (!profile.process) {
    // No format conversion — strip metadata where possible by type.
    const ext = originalExtension.toLowerCase();
    if (SHARP_RASTER_EXTS.has(ext)) {
      const buffer = await stripRasterMetadata(inputBuffer, ext);
      return { buffer, extension: originalExtension };
    }
    if (ext === 'svg') {
      return { buffer: stripSvgMetadata(inputBuffer), extension: 'svg' };
    }
    // Audio, video, and unknown formats: no stripping without additional deps.
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
