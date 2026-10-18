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
  /**
   * Seconds into the video of the frame the owner chose: that frame exactly
   * is taken, and no other is looked at. It is scored all the same, so it
   * counts as compared like a frame chosen here.
   */
  at?: number;
  /**
   * Frames a second, when known. A player paused at a moment shows the frame
   * that began at it or before, where a seek finds the one that begins at it
   * or after: knowing how long a frame lasts, the seek starts a frame early.
   */
  fps?: number;
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
 * `VIDEO_PREVIEW_FRAME_POSITIONS`, all of which are looked at — or, given
 * `at`, the frame shown at that moment.
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
    if (options.at !== undefined) {
      const at = Math.max(
        0,
        duration ? Math.min(options.at, duration) : options.at,
      );
      // The frame on screen at `at` began less than a frame before it; a
      // thousandth of a frame spares the one that ended exactly there.
      const frameLength =
        options.fps && options.fps > 0 ? 1 / options.fps : undefined;
      const seek = frameLength ? Math.max(0, at - frameLength * 0.999) : at;
      // A moment at the very end has no frame after it: the last frame is
      // what a player paused there shows.
      const frame = await grabExactFrame(inputPath, outputPath, seek).catch(
        () => grabLastFrame(inputPath, outputPath),
      );
      return { frame, score: await scoreFrame(frame), at };
    }
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

/**
 * The frame shown at `seconds`, exactly: the seek decodes up to it. Past the
 * last frame ffmpeg ends without writing one, and reading it fails.
 */
async function grabExactFrame(
  inputPath: string,
  outputPath: string,
  seconds: number,
): Promise<Buffer> {
  await rm(outputPath, { force: true });
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-ss', seconds.toFixed(6)])
      .outputOptions(['-frames:v', '1'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
  return await readFile(outputPath);
}

/**
 * The video's last frame: every frame of its final second is written over
 * the one before it.
 */
async function grabLastFrame(
  inputPath: string,
  outputPath: string,
): Promise<Buffer> {
  await rm(outputPath, { force: true });
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-sseof', '-1'])
      .outputOptions(['-update', '1'])
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
