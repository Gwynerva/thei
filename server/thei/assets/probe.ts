import type { AssetDimensions } from './process';
import { runFfprobe } from './ffmpeg';

/** What a probe learns about a media file: its first picture and sound. */
export interface VideoInspection extends AssetDimensions {
  hasAudio: boolean;
  duration?: number;
  fps?: number;
  /** Bits per second of the video stream, when the container records it. */
  bitrate?: number;
  /** Bits per second of the whole file, as ffprobe reports it. */
  overallBitrate?: number;
  audioBitrate?: number;
  /** The video codec, as ffmpeg names it. */
  codec?: string;
  /** Of the first sound stream: its codec, as ffmpeg names it. */
  audioCodec?: string;
  channels?: number;
  sampleRate?: number;
  /** The video's pixel format, as ffmpeg names it: `yuv420p`, `yuv420p10le`. */
  pixelFormat?: string;
  /** The video's transfer characteristics: `bt709`, `smpte2084`, `arib-std-b67`. */
  colorTransfer?: string;
  /** The video's colour primaries: `bt709`, `bt2020`. */
  colorPrimaries?: string;
  /** The video's matrix coefficients: `bt709`, `bt2020nc`. */
  colorSpace?: string;
}

/** The part of ffprobe's JSON this module reads. */
export interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
    bit_rate?: string;
  };
}

export interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  color_transfer?: string;
  color_primaries?: string;
  color_space?: string;
  bit_rate?: string;
  duration?: string;
  /** Frames a second as a ratio, `30000/1001`; `0/0` when unknown. */
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
  side_data_list?: Array<{ side_data_type?: string; rotation?: number }>;
}

/**
 * ffprobe ran and could not read the file: the file's fault, and the only
 * failure of a probe that says the file is no good. ffprobe missing, or not
 * starting, rejects with an error of its own, which callers let through
 * (`unlessUnreadable`), so a site without its tools never takes every upload
 * for a broken one.
 */
export class UnreadableMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableMediaError';
  }
}

/**
 * For the `.catch` of a probe whose failure on the file is an answer:
 * nothing when ffprobe could not read the file, anything else thrown on.
 */
export function unlessUnreadable(error: unknown): undefined {
  if (error instanceof UnreadableMediaError) return undefined;
  throw error;
}

/**
 * Asks ffprobe about a file. Rejects with `UnreadableMediaError` when
 * ffprobe cannot read the file at all, and with ffprobe's own error when it
 * cannot run; a file with nothing of interest in it still answers, with no
 * picture and `hasAudio: false`.
 */
export async function probeMedia(filePath: string): Promise<VideoInspection> {
  // Decoded once it is whole: a multi-byte character may straddle two chunks.
  const stdout: Buffer[] = [];
  let stderr = '';
  const code = await runFfprobe(
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      filePath,
    ],
    {
      onStdout: (chunk) => {
        stdout.push(chunk);
      },
      onStderr: (chunk) => {
        stderr += chunk;
      },
    },
  );
  if (code !== 0) {
    throw new UnreadableMediaError(
      `ffprobe exited with ${code}: ${stderr.trim().split(/\r?\n/).pop() ?? ''}`,
    );
  }
  let output: FfprobeOutput;
  try {
    output = JSON.parse(
      Buffer.concat(stdout).toString('utf8'),
    ) as FfprobeOutput;
  } catch {
    // ffprobe answers any file it read in JSON: what ran is not ffprobe.
    throw new Error('ffprobe printed no JSON');
  }
  return inspectionFromProbe(output);
}

/**
 * Reads ffprobe's answer.
 *
 * The first picture that is not a cover (an MP3's attached picture is a
 * "video" stream too) and the first sound are the ones that count. A stream
 * carries its coded size; a phone records portrait video as landscape frames
 * plus a rotation, and every player — ffmpeg's own transcode included —
 * shows it turned, so a quarter turn swaps the reported sides.
 */
export function inspectionFromProbe(output: FfprobeOutput): VideoInspection {
  const streams = output.streams ?? [];
  const video = streams.find(
    (stream) =>
      stream.codec_type === 'video' && !stream.disposition?.attached_pic,
  );
  const audio = streams.find((stream) => stream.codec_type === 'audio');

  const coded =
    video?.width && video.height
      ? { width: video.width, height: video.height }
      : undefined;
  const quarterTurned = video ? isQuarterTurn(streamRotation(video)) : false;
  const duration =
    positive(output.format?.duration) ??
    positive(video?.duration) ??
    positive(audio?.duration);
  const fps =
    frameRate(video?.avg_frame_rate) ?? frameRate(video?.r_frame_rate);
  const bitrate = positive(video?.bit_rate);
  const audioBitrate = positive(audio?.bit_rate);
  const overallBitrate = positive(output.format?.bit_rate);
  const channels = audio?.channels;
  const sampleRate = positive(audio?.sample_rate);

  return {
    ...(coded
      ? quarterTurned
        ? { width: coded.height, height: coded.width }
        : coded
      : {}),
    ...(duration ? { duration } : {}),
    ...(fps ? { fps } : {}),
    ...(bitrate ? { bitrate: Math.round(bitrate) } : {}),
    ...(overallBitrate ? { overallBitrate: Math.round(overallBitrate) } : {}),
    ...(audioBitrate ? { audioBitrate: Math.round(audioBitrate) } : {}),
    ...(video?.codec_name ? { codec: video.codec_name } : {}),
    ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}),
    ...(channels ? { channels } : {}),
    ...(sampleRate ? { sampleRate: Math.round(sampleRate) } : {}),
    ...(video?.pix_fmt ? { pixelFormat: video.pix_fmt } : {}),
    ...(video?.color_transfer ? { colorTransfer: video.color_transfer } : {}),
    ...(video?.color_primaries
      ? { colorPrimaries: video.color_primaries }
      : {}),
    ...(video?.color_space ? { colorSpace: video.color_space } : {}),
    hasAudio: Boolean(audio),
  };
}

/**
 * Whether a video is high dynamic range: PQ or HLG, which SDR shows wrong.
 * The transfer alone says so; the primaries only say which gamut the
 * mapping starts from (`videoColorFilters`), and are often left untagged.
 */
export function isHdr(inspection: { colorTransfer?: string }): boolean {
  return (
    inspection.colorTransfer === 'smpte2084' ||
    inspection.colorTransfer === 'arib-std-b67'
  );
}

/**
 * The rotation recorded for a stream, in degrees: a display matrix in the
 * side data, or the older `rotate` tag.
 */
function streamRotation(stream: FfprobeStream): number {
  const matrix = stream.side_data_list?.find(
    (entry) => typeof entry.rotation === 'number',
  );
  if (matrix?.rotation !== undefined) return matrix.rotation;
  const tag = Number(stream.tags?.rotate);
  return Number.isFinite(tag) ? tag : 0;
}

function isQuarterTurn(degrees: number): boolean {
  return Math.abs(Math.round(degrees)) % 180 === 90;
}

/** A ratio such as `30000/1001` as a number, to three decimals. */
function frameRate(ratio: string | undefined): number | undefined {
  if (!ratio) return undefined;
  const [top, bottom = '1'] = ratio.split('/');
  const value = Number(top) / Number(bottom);
  return Number.isFinite(value) && value > 0
    ? Math.round(value * 1000) / 1000
    : undefined;
}

function positive(text: string | number | undefined): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
