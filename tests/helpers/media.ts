/**
 * Media made for tests and the bench, at any size, with nothing kept in git:
 * photo-like pictures by sharp, clips and recordings by the ffmpeg Thei
 * pins, and quality metrics by ffmpeg's own filters.
 *
 * Nothing here is deterministic to the byte — libvips's noise has no seed —
 * so a test asserts on dimensions, formats, order of sizes and metrics
 * against thresholds, never on hashes of what this module made.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { resolveFfmpegTools } from '../../update/ffmpeg/tools';

/** What the asset pipeline takes as a staged source. */
export interface MediaFile {
  path: string;
  size: number;
  hash: string;
  extension: string;
  owned: boolean;
}

export interface PhotoOptions {
  width: number;
  height: number;
  /** JPEG quality of the file written; 92 is what a camera writes. */
  quality?: number;
  /** An EXIF orientation to record, 6 being a phone held upright. */
  orientation?: number;
  /** PNG instead of JPEG. */
  png?: boolean;
}

/**
 * A picture that compresses like a photograph: soft blobs of colour from
 * coarse noise blown up, fine grain over them, a gradient of light and a few
 * hard-edged shapes. Pure noise would be the worst case for every encoder
 * and nothing like a photo; a flat colour the best case and as unlike one.
 */
export async function makePhoto(
  path: string,
  options: PhotoOptions,
): Promise<MediaFile> {
  const { width, height } = options;
  const coarse = await sharp({
    create: {
      width: Math.max(2, Math.ceil(width / 24)),
      height: Math.max(2, Math.ceil(height / 24)),
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 60 },
    },
  })
    .resize(width, height, { kernel: 'lanczos3' })
    .raw()
    .toBuffer();
  const grain = await sharp({
    create: {
      width,
      height,
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 14 },
    },
  })
    .raw()
    .toBuffer();
  const shapes = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="0.35"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
      `<circle cx="${width * 0.3}" cy="${height * 0.4}" r="${Math.min(width, height) * 0.18}" fill="#d9a441" fill-opacity="0.8"/>` +
      `<rect x="${width * 0.55}" y="${height * 0.2}" width="${width * 0.3}" height="${height * 0.5}" rx="${width * 0.02}" fill="#2a5d8f" fill-opacity="0.75"/>` +
      `<path d="M0 ${height * 0.8} L${width} ${height * 0.65} L${width} ${height} L0 ${height} Z" fill="#4b7f3a" fill-opacity="0.7"/>` +
      `</svg>`,
  );
  let picture = sharp(coarse, { raw: { width, height, channels: 3 } })
    .composite([
      {
        input: grain,
        raw: { width, height, channels: 3 },
        blend: 'soft-light',
      },
      { input: shapes, blend: 'over' },
    ])
    .withMetadata(
      options.orientation ? { orientation: options.orientation } : {},
    );
  picture = options.png
    ? picture.png()
    : picture.jpeg({ quality: options.quality ?? 92 });
  const bytes = await picture.toBuffer();
  return await writeMedia(path, bytes, options.png ? 'png' : 'jpg');
}

export interface ClipOptions {
  width?: number;
  height?: number;
  seconds?: number;
  fps?: number;
  /** A tone as the sound track; true by default. */
  audio?: boolean;
  /**
   * Ten-bit HLG in BT.2020, as a phone records: the pixels are not really
   * HDR, but the file is tagged and shaped like one, which is what the
   * pipeline reads. `'pq-transfer-only'` is ten-bit PQ tagged by its
   * transfer alone, the primaries and the matrix left unspecified, as some
   * cameras and editors write it.
   */
  hdr?: boolean | 'pq-transfer-only';
}

/**
 * A moving test picture as H.264 in MP4, what a camera or a phone hands in.
 */
export async function makeClip(
  path: string,
  options: ClipOptions = {},
): Promise<MediaFile> {
  const {
    width = 1920,
    height = 1080,
    seconds = 3,
    fps = 30,
    audio = true,
    hdr = false,
  } = options;
  await mkdir(dirname(path), { recursive: true });
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${width}x${height}:rate=${fps}:duration=${seconds}`,
    ...(audio
      ? [
          '-f',
          'lavfi',
          '-i',
          `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
        ]
      : []),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    // The frames carry the colour, so the encoder writes it into the stream
    // and the container records it, as a phone's file has it.
    ...(hdr === 'pq-transfer-only'
      ? [
          '-vf',
          'format=yuv420p10le,setparams=color_trc=smpte2084',
          '-pix_fmt',
          'yuv420p10le',
          '-color_trc',
          'smpte2084',
        ]
      : hdr
        ? [
            '-vf',
            'format=yuv420p10le,setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc',
            '-pix_fmt',
            'yuv420p10le',
            '-color_primaries',
            'bt2020',
            '-color_trc',
            'arib-std-b67',
            '-colorspace',
            'bt2020nc',
          ]
        : ['-pix_fmt', 'yuv420p']),
    ...(audio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-shortest',
    '-movflags',
    '+faststart',
    path,
  ]);
  return await describeMedia(path, 'mp4');
}

export interface RecordingOptions {
  seconds?: number;
  /** Stereo by default. */
  mono?: boolean;
}

/** A tone with a slow tremolo as a WAV recording. */
export async function makeRecording(
  path: string,
  options: RecordingOptions = {},
): Promise<MediaFile> {
  const { seconds = 10, mono = false } = options;
  await mkdir(dirname(path), { recursive: true });
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=330:sample_rate=48000:duration=${seconds},tremolo=f=0.5:d=0.7`,
    '-ac',
    mono ? '1' : '2',
    '-c:a',
    'pcm_s16le',
    path,
  ]);
  return await describeMedia(path, 'wav');
}

export interface ImageComparison {
  /** Structural similarity over all channels, 0–1. */
  ssim: number;
  /** Peak signal-to-noise ratio averaged over the channels, dB. */
  psnr: number;
}

/**
 * How close a picture is to another of the same size, by ffmpeg's `ssim` and
 * `psnr` filters. Both are decoded by sharp first, so an AVIF, a WebP or a
 * JPEG compares as its pixels; with `side`, both are made that long first,
 * which is quick and still tells a broken encode from a good one.
 */
export async function compareImages(
  reference: string | Buffer,
  candidate: string | Buffer,
  options: { side?: number; scratch: string },
): Promise<ImageComparison> {
  const prepare = async (input: string | Buffer, name: string) => {
    let pipeline = sharp(input).autoOrient();
    if (options.side) {
      pipeline = pipeline.resize({
        width: options.side,
        height: options.side,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const { data, info } = await pipeline
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const file = join(options.scratch, `${name}.rgb`);
    await writeFile(file, data);
    return { file, width: info.width, height: info.height };
  };
  await mkdir(options.scratch, { recursive: true });
  const a = await prepare(reference, `compare-a-${process.hrtime.bigint()}`);
  const b = await prepare(candidate, `compare-b-${process.hrtime.bigint()}`);
  try {
    if (a.width !== b.width || a.height !== b.height) {
      throw new Error(
        `compareImages: ${a.width}x${a.height} against ${b.width}x${b.height}`,
      );
    }
    const rawInput = (file: string) => [
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-s',
      `${a.width}x${a.height}`,
      '-i',
      file,
    ];
    const log = await runFfmpeg([
      ...rawInput(a.file),
      ...rawInput(b.file),
      '-lavfi',
      '[0:v][1:v]ssim;[0:v][1:v]psnr',
      '-f',
      'null',
      '-',
    ]);
    return parseMetrics(log);
  } finally {
    await rm(a.file, { force: true });
    await rm(b.file, { force: true });
  }
}

export interface VideoComparison extends ImageComparison {
  /** VMAF, 0–100, when the build has libvmaf; otherwise absent. */
  vmaf?: number;
}

/**
 * How close a video is to another of the same frame size and length. The
 * candidate is scaled to the reference's size first, so an encode at a
 * smaller size still compares with the source.
 */
export async function compareVideos(
  reference: string,
  candidate: string,
  options: { vmaf?: boolean } = {},
): Promise<VideoComparison> {
  const filters = [
    '[1:v][0:v]scale2ref=flags=lanczos[c][r]',
    '[r]format=yuv420p,split=3[r1][r2][r3]',
    '[c]format=yuv420p,split=3[c1][c2][c3]',
    '[r1][c1]ssim',
    '[r2][c2]psnr',
    ...(options.vmaf ? ['[c3][r3]libvmaf'] : ['[r3][c3]nullsink']),
  ];
  const log = await runFfmpeg([
    '-i',
    reference,
    '-i',
    candidate,
    '-lavfi',
    filters.join(';'),
    '-f',
    'null',
    '-',
  ]);
  const metrics = parseMetrics(log);
  const vmaf = /VMAF score:\s*([\d.]+)/.exec(log);
  return vmaf ? { ...metrics, vmaf: Number(vmaf[1]) } : metrics;
}

function parseMetrics(log: string): ImageComparison {
  const ssim = /SSIM .*?All:([\d.]+)/.exec(log);
  const psnr = /PSNR .*?average:([\d.]+|inf)/.exec(log);
  if (!ssim || !psnr) {
    throw new Error(`ffmpeg printed no metrics:\n${log.slice(-2000)}`);
  }
  return {
    ssim: Number(ssim[1]),
    psnr: psnr[1] === 'inf' ? Infinity : Number(psnr[1]),
  };
}

/** The pinned ffmpeg, run to the end; rejects with its log on failure. */
export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      resolveFfmpegTools().ffmpeg,
      ['-hide_banner', '-nostdin', ...args],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let log = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (log += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(log)
        : reject(new Error(`ffmpeg exited with ${code}:\n${log.slice(-3000)}`)),
    );
  });
}

async function writeMedia(
  path: string,
  bytes: Buffer,
  extension: string,
): Promise<MediaFile> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return {
    path,
    size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'),
    extension,
    owned: false,
  };
}

/** A file already written, as the pipeline takes it. */
export async function describeMedia(
  path: string,
  extension: string,
): Promise<MediaFile> {
  const bytes = await readFile(path);
  return {
    path,
    size: (await stat(path)).size,
    hash: createHash('sha256').update(bytes).digest('hex'),
    extension,
    owned: false,
  };
}
