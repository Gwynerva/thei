import { writeFile, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  FRAME_SCORE_SAMPLE_SIDE,
  VIDEO_PREVIEW_FRAME_POSITIONS,
  frameScore,
} from '#layers/thei/shared/media-frame-score';
import { runFfmpeg } from './ffmpeg';
import { theiTempPath } from './temp';
import type { AssetBytes } from './bytes';
import { unlessUnreadable } from './probe';
import {
  inspectVideoFile,
  videoColorFilters,
  type VideoColorSource,
} from './process';

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
  /**
   * What is known of the video's colour, from a probe the caller made: an
   * HDR recording's frames are mapped to SDR like its encode's, or the poster
   * would be washed out. Left out, the file is probed for it.
   */
  color?: VideoColorSource;
  /**
   * The longest side the frame is written at, never enlarged: ffmpeg makes
   * it small, so a frame of an 8K video is never read back whole. The
   * preview passes its own size; left out, the frame keeps the video's.
   */
  maxSide?: number;
}

export interface VideoThumbnail {
  /** The frame, as PNG. */
  frame: Buffer;
  /** Seconds into the video of the frame: a player put there shows it. */
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

    const inspected =
      options.duration === undefined || options.color === undefined
        ? await inspectVideoFile(inputPath).catch(unlessUnreadable)
        : undefined;
    const duration = options.duration ?? inspected?.duration;
    const filters = frameFilters(
      options.maxSide,
      videoColorFilters(options.color ?? inspected ?? {}),
    );
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
      const frame = await grabExactFrame(
        inputPath,
        outputPath,
        seek,
        filters,
      ).catch(() => grabLastFrame(inputPath, outputPath, filters));
      return { frame, score: await scoreFrame(frame), at };
    }
    const positions =
      duration && duration > 1
        ? VIDEO_PREVIEW_FRAME_POSITIONS.map(
            (share) => Math.round(share * duration * 10) / 10,
          )
        : [0];
    // A moment inside the frame picked, so that a player put there shows it
    // and not the one before it: half a frame on, or a thousandth of a second.
    const inside = options.fps && options.fps > 0 ? 1 / options.fps / 2 : 0.001;
    const momentOf = (seconds: number, picked: number | undefined) =>
      Math.round((seconds + (picked ?? 0) + inside) * 1000) / 1000;

    let best: VideoThumbnail | undefined;
    for (const seconds of positions) {
      const grabbed = await grabFrame(
        inputPath,
        outputPath,
        seconds,
        filters,
      ).catch(() => undefined);
      if (!grabbed) continue;
      const score = await scoreFrame(grabbed.frame);
      if (!best || score > best.score)
        best = {
          frame: grabbed.frame,
          score,
          at: momentOf(seconds, grabbed.picked),
        };
    }
    // Nothing usable past the opening — a very short clip, or one the probe
    // misjudged: the first frame is still a frame.
    if (!best) {
      const grabbed = await grabFrame(inputPath, outputPath, 0, filters);
      best = {
        frame: grabbed.frame,
        score: await scoreFrame(grabbed.frame),
        at: momentOf(0, grabbed.picked),
      };
    }
    return best;
  } finally {
    if (stagedInput) await rm(stagedInput, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

/**
 * What a frame goes through once it is picked: made no larger than
 * `maxSide`, never enlarged, then mapped from HDR. The `thumbnail` filter
 * still weighs the frames whole, so the frame picked is the one it always
 * was; only what is written and read back is small, and the colour work is
 * done on the small frame, as the encode's is. zscale takes a subsampled
 * frame only at even sides, so before a mapping the sides are kept even.
 */
export function frameFilters(
  maxSide: number | undefined,
  color: string[],
): string[] {
  if (!maxSide) return color;
  const box = `w='min(iw,${maxSide})':h='min(ih,${maxSide})'`;
  const even = color.length ? ':force_divisible_by=2' : '';
  return [
    `scale=${box}:force_original_aspect_ratio=decrease${even}:flags=lanczos`,
    ...color,
  ];
}

/**
 * One frame ffmpeg writes from the video, read back. The output of a run
 * before is removed first: a seek past the last frame ends without writing
 * one, and that must fail rather than read the frame left behind.
 */
async function writeFrame(
  inputPath: string,
  outputPath: string,
  inputOptions: string[],
  outputOptions: string[],
  onLog?: (line: string) => void,
): Promise<Buffer> {
  await rm(outputPath, { force: true });
  let pending = '';
  let tail = '';
  const code = await runFfmpeg(
    [
      '-hide_banner',
      '-y',
      ...inputOptions,
      '-i',
      inputPath,
      ...outputOptions,
      outputPath,
    ],
    {
      onStderr: (chunk) => {
        // ffmpeg ends a progress line with a carriage return and a log line
        // with a newline; the filter's report is one of the latter, and the
        // last line of all says why a run failed.
        pending += chunk;
        const lines = pending.split(/\r\n|\r|\n/);
        pending = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) tail = line;
          onLog?.(line);
        }
      },
    },
  );
  if (pending.trim()) {
    tail = pending;
    onLog?.(pending);
  }
  if (code !== 0) {
    throw new Error(`ffmpeg exited with ${code}: ${tail.trim()}`);
  }
  return await readFile(outputPath);
}

/**
 * The frame ffmpeg finds most typical of the second that starts at
 * `seconds`, and how far into that second it stands: the filter tells which
 * frame it picked, and the moment is that frame's, not the second's start.
 */
async function grabFrame(
  inputPath: string,
  outputPath: string,
  seconds: number,
  filters: string[],
): Promise<{ frame: Buffer; picked?: number }> {
  let picked: number | undefined;
  const frame = await writeFrame(
    inputPath,
    outputPath,
    ['-ss', seconds.toFixed(3)],
    [
      '-vf',
      [`thumbnail=${THUMBNAIL_BATCH}`, ...filters].join(','),
      '-frames:v',
      '1',
    ],
    (line) => {
      const match = /pts_time=(\d+(?:\.\d+)?)\)? selected/.exec(line);
      if (match) picked = Number(match[1]);
    },
  );
  return { frame, picked };
}

/** The frame shown at `seconds`, exactly: the seek decodes up to it. */
function grabExactFrame(
  inputPath: string,
  outputPath: string,
  seconds: number,
  filters: string[],
) {
  return writeFrame(
    inputPath,
    outputPath,
    ['-ss', seconds.toFixed(6)],
    [...filterOption(filters), '-frames:v', '1'],
  );
}

function filterOption(filters: string[]): string[] {
  return filters.length ? ['-vf', filters.join(',')] : [];
}

/**
 * The video's last frame: every frame of its final second is written over
 * the one before it.
 */
function grabLastFrame(
  inputPath: string,
  outputPath: string,
  filters: string[],
) {
  return writeFrame(
    inputPath,
    outputPath,
    ['-sseof', '-1'],
    [...filterOption(filters), '-update', '1'],
  );
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
