import { writeFile, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { theiTempPath } from './temp';
import type { AssetBytes } from './bytes';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Extracts the first frame of a video and returns it as a PNG buffer.
 *
 * ffmpeg needs seekable input, so a video that is already staged on disk is
 * read from where it lies; only a video handed over as a buffer has to be
 * written out first.
 */
export async function extractVideoThumbnail(
  source: AssetBytes | Buffer,
): Promise<Buffer> {
  const bytes: AssetBytes = Buffer.isBuffer(source)
    ? { buffer: source }
    : source;
  const id = randomUUID();
  const stagedInput = bytes.buffer
    ? theiTempPath(`thei-thumb-in-${id}`)
    : undefined;
  const inputPath = stagedInput ?? bytes.path!;
  const outputPath = theiTempPath(`thei-thumb-out-${id}.png`);

  try {
    if (stagedInput && bytes.buffer) await writeFile(stagedInput, bytes.buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-ss', '0', '-frames:v', '1'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    return await readFile(outputPath);
  } finally {
    if (stagedInput) await rm(stagedInput, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}
