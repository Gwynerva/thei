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

async function stripRasterMetadata(
  buf: Buffer,
  ext: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const img = sharp(buf);
  let pipeline: sharp.Sharp;
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      pipeline = img.jpeg();
      break;
    case 'png':
      pipeline = img.png();
      break;
    case 'gif':
      pipeline = img.gif();
      break;
    case 'webp':
      pipeline = img.webp();
      break;
    case 'avif':
      pipeline = img.avif();
      break;
    default:
      pipeline = img;
      break;
  }
  const { data: buffer, info } = await pipeline.toBuffer({
    resolveWithObject: true,
  });
  return { buffer, width: info.width, height: info.height };
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
): Promise<{
  buffer: Buffer;
  extension: string;
  width?: number;
  height?: number;
}> {
  if (!profile.process) {
    // No format conversion — strip metadata where possible by type.
    const ext = originalExtension.toLowerCase();
    if (SHARP_RASTER_EXTS.has(ext)) {
      const { buffer, width, height } = await stripRasterMetadata(
        inputBuffer,
        ext,
      );
      return { buffer, extension: originalExtension, width, height };
    }
    if (ext === 'svg') {
      const buffer = stripSvgMetadata(inputBuffer);
      const { width, height } = await sharp(buffer).metadata();
      return { buffer, extension: 'svg', width, height };
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
      const { data: buffer, info } = await pipeline
        .webp({ quality, ...(effort !== undefined && { effort }) })
        .toBuffer({ resolveWithObject: true });
      return {
        buffer,
        extension: 'webp',
        width: info.width,
        height: info.height,
      };
    }
    case 'mp4': {
      throw new Error('MP4 processing not yet implemented');
    }
  }
}
