import { writeFile, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import { theiTempPath } from './temp';
import type { AssetBytes } from './bytes';
import { inspectVideoFile } from './process';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Where in a video to look for a frame worth showing, as shares of its
 * length. The opening is skipped: a fade from black, a title card or a logo
 * is what a video starts with, not what it is about. Later points are tried
 * only when the earlier ones come out flat.
 */
const FRAME_POSITIONS = [0.1, 0.3, 0.5, 0.75];
/**
 * Frames ffmpeg's `thumbnail` filter weighs at each point, picking the one
 * nearest their average look, so a single black or blown-out frame in a run
 * of ordinary ones is passed over. About a second of video.
 */
const THUMBNAIL_BATCH = 30;
/**
 * Below this a frame is as good as empty: black, white, grey, a plain card.
 * It says nothing about the video and would make its accent colour neutral.
 * A frame of one strong colour is not empty — it at least has the colour.
 */
export const FLAT_FRAME_SPREAD = 12;

export interface VideoThumbnailOptions {
  /** Seconds, when the caller already knows; otherwise the file is probed. */
  duration?: number;
}

export interface VideoThumbnail {
  /** The frame, as PNG. */
  frame: Buffer;
  /** Seconds into the video the frame was looked for. */
  at: number;
}

/**
 * Extracts a representative frame of a video and returns it as a PNG buffer.
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
        ? FRAME_POSITIONS.map((share) => Math.round(share * duration * 10) / 10)
        : [0];

    let best: { frame: Buffer; spread: number; at: number } | undefined;
    for (const seconds of positions) {
      const frame = await grabFrame(inputPath, outputPath, seconds).catch(
        () => undefined,
      );
      if (!frame) continue;
      const spread = await frameLiveliness(frame);
      if (!best || spread > best.spread) best = { frame, spread, at: seconds };
      if (spread >= FLAT_FRAME_SPREAD) break;
    }
    // Nothing usable past the opening — a very short clip, or one the probe
    // misjudged: the first frame is still a frame.
    if (!best) {
      best = {
        frame: await grabFrame(inputPath, outputPath, 0),
        spread: 0,
        at: 0,
      };
    }
    return { frame: best.frame, at: best.at };
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
 * How much a frame has to show: the spread of values within its widest
 * channel, or a third of how far its channels sit apart — a plain red card
 * scores by its colour, a dark frame with a faint tint does not.
 */
export async function frameLiveliness(frame: Buffer): Promise<number> {
  const { channels } = await sharp(frame).stats();
  const colour = channels.slice(0, 3);
  const spread = Math.max(...colour.map((channel) => channel.stdev));
  const means = colour.map((channel) => channel.mean);
  const colourfulness = Math.max(...means) - Math.min(...means);
  return Math.max(spread, colourfulness / 3);
}
