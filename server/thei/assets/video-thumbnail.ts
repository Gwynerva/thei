import { writeFile, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import {
  FRAME_SCORE_SAMPLE_SIDE,
  VIDEO_PREVIEW_FRAME_POSITIONS,
  frameScore,
} from '#layers/thei/shared/media-frame-score';
import { theiTempPath } from './temp';
import type { AssetBytes } from './bytes';
import { inspectVideoFile } from './process';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Frames ffmpeg's `thumbnail` filter weighs at each point, picking the one
 * nearest their average look, so a single black or blown-out frame in a run
 * of ordinary ones is passed over. About a second of video.
 */
const THUMBNAIL_BATCH = 30;

export interface VideoThumbnailOptions {
  /** Seconds, when the caller already knows; otherwise the file is probed. */
  duration?: number;
}

export interface VideoThumbnail {
  /** The frame, as PNG. */
  frame: Buffer;
  /** Seconds into the video the frame was looked for. */
  at: number;
  /** How well it shows the video (`frameScore`). */
  score: number;
}

/**
 * Extracts the frame that best shows a video and returns it as a PNG buffer:
 * the most colourful, well exposed of the points in
 * `VIDEO_PREVIEW_FRAME_POSITIONS`, all of which are looked at.
 *
 * ffmpeg needs seekable input, so a video that is already staged on disk is
 * read from where it lies; only a video handed over as a buffer has to be
 * written out first.
 */
export async function extractVideoThumbnail(
  source: AssetBytes | Buffer,
  options: VideoThumbnailOptions = {},
): Promise<VideoThumbnail> {
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

    const duration =
      options.duration ??
      (await inspectVideoFile(inputPath).catch(() => undefined))?.duration;
    const positions =
      duration && duration > 1
        ? VIDEO_PREVIEW_FRAME_POSITIONS.map(
            (share) => Math.round(share * duration * 10) / 10,
          )
        : [0];

    let best: VideoThumbnail | undefined;
    for (const seconds of positions) {
      const frame = await grabFrame(inputPath, outputPath, seconds).catch(
        () => undefined,
      );
      if (!frame) continue;
      const score = await scoreFrame(frame);
      if (!best || score > best.score) best = { frame, score, at: seconds };
    }
    // Nothing usable past the opening — a very short clip, or one the probe
    // misjudged: the first frame is still a frame.
    if (!best) {
      const frame = await grabFrame(inputPath, outputPath, 0);
      best = { frame, score: await scoreFrame(frame), at: 0 };
    }
    return best;
  } finally {
    if (stagedInput) await rm(stagedInput, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/** The frame ffmpeg finds most typical of the second that starts at `seconds`. */
async function grabFrame(
  inputPath: string,
  outputPath: string,
  seconds: number,
): Promise<Buffer> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-ss', seconds.toFixed(3)])
      .outputOptions(['-vf', `thumbnail=${THUMBNAIL_BATCH}`, '-frames:v', '1'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
  return await readFile(outputPath);
}

/** `frameScore` of a frame, read from a small copy of it. */
export async function scoreFrame(frame: Buffer): Promise<number> {
  const { data } = await sharp(frame)
    .resize(FRAME_SCORE_SAMPLE_SIDE, FRAME_SCORE_SAMPLE_SIDE, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return frameScore(data, 3);
}
