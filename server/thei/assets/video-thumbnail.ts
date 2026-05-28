import { writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Extracts the first frame of a video buffer and returns it as a WebP buffer.
 * Uses temp files because ffmpeg needs seekable input for frame extraction.
 */
export async function extractVideoThumbnail(
  videoBuffer: Buffer,
): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `thei-thumb-in-${id}`);
  const outputPath = join(tmpdir(), `thei-thumb-out-${id}.png`);

  try {
    await writeFile(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-ss', '0', '-frames:v', '1'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    const pngBuffer = await readFile(outputPath);
    return await sharp(pngBuffer).webp({ quality: 85 }).toBuffer();
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}
