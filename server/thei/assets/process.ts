import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { createError } from 'h3';
import sharp from 'sharp';
import { theiTempPath } from './temp';
import { assetBytesSize, fileBytes, type AssetBytes } from './bytes';
import { AssetType } from '../../../shared/asset';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from '../../../shared/assets/formats';
import {
  assetImageFormatExtension,
  type AssetFileZipSettings,
  type AssetImageTransformSettings,
  type AssetTransformSettings,
  type AssetVideoTransformSettings,
} from '../../../shared/asset-upload-settings';
import {
  imageDisplayQualityToAvifQuality,
  videoAudioBitrate,
  videoTargetBitrate,
  type VideoBitrateSource,
} from '../../../shared/asset-upload-quality';
import {
  clampCropRect,
  rotatedDimensions,
  type AssetCropRect,
} from '../../../shared/asset-crop';
import { cropSvgToFile } from './svg-crop';
import { SVG_BASE_DENSITY, svgRasterDensity } from './svg-density';
import { zipFileToPath } from './zip';
import { stripAssetMetadata } from './strip-metadata';

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO_EXTS = new Set<string>(AUDIO_EXTENSIONS);

export interface AssetDimensions {
  width?: number;
  height?: number;
}

export interface VideoInspection extends AssetDimensions {
  hasAudio: boolean;
  duration?: number;
  fps?: number;
  /** Bits per second of the video stream, when the container records it. */
  bitrate?: number;
  /** Bits per second of the whole file, as ffmpeg reports it. */
  overallBitrate?: number;
  audioBitrate?: number;
  /** The video codec, as ffmpeg names it. */
  codec?: string;
}

/** What a transform and its size estimate learn about a video. */
export interface VideoSourceInfo {
  duration?: number;
  fps?: number;
  /** Bits per second of the video stream. */
  bitrate?: number;
  codec?: string;
}

export interface ProcessedAsset {
  bytes: AssetBytes;
  extension: string;
  type: AssetType;
  dimensions: AssetDimensions;
  hasAudio?: boolean;
  /** Of a video, read from the file once it exists. */
  video?: VideoSourceInfo;
}

/** An upload staged on disk, the input to every processing path. */
export interface AssetSourceFile {
  path: string;
  size: number;
  hash: string;
  extension: string;
  /**
   * Whether this file is scratch that storage may move into the library.
   *
   * False when re-deriving from an asset that is already stored, because the
   * path is then the live library file.
   */
  owned: boolean;
}

export interface AssetProcessOptions {
  onProgress?: (progress: number) => void;
  /** Stops an encode that nobody is waiting for any more. */
  signal?: AbortSignal;
}

export function inferAssetType(extension: string): AssetType {
  if (IMAGE_EXTS.has(extension)) return AssetType.Image;
  if (VIDEO_EXTS.has(extension)) return AssetType.Video;
  if (AUDIO_EXTS.has(extension)) return AssetType.Audio;
  return AssetType.Other;
}

export async function getImageDimensions(
  input: Buffer | string,
): Promise<AssetDimensions> {
  // Dimensions as displayed: an EXIF-rotated photo is taller than it is wide.
  const { width, height } = (await sharp(input).metadata()).autoOrient;
  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

export async function inspectVideo(buffer: Buffer): Promise<VideoInspection> {
  const id = randomUUID();
  const inputPath = theiTempPath(`thei-probe-in-${id}`);

  try {
    await writeFile(inputPath, buffer);
    return await inspectVideoFile(inputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
  }
}

export async function inspectVideoFile(
  filePath: string,
): Promise<VideoInspection> {
  const inspectionText = await readFfmpegInputInfo(filePath);
  return parseFfmpegInputInfo(inspectionText);
}

export async function getVideoDimensions(
  input: Buffer | string,
): Promise<AssetDimensions> {
  const { width, height } =
    typeof input === 'string'
      ? await inspectVideoFile(input)
      : await inspectVideo(input);
  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

export async function inspectAssetDimensions(
  input: Buffer | string,
  extension: string,
  type: AssetType,
): Promise<AssetDimensions> {
  if (type === AssetType.Image) {
    return await getImageDimensions(input).catch(() => ({}));
  }
  if (type === AssetType.Video) {
    return await getVideoDimensions(input).catch(() => ({}));
  }
  return {};
}

export async function processOriginalAsset(
  source: AssetSourceFile,
): Promise<ProcessedAsset> {
  const extension = source.extension.toLowerCase();
  const type = inferAssetType(extension);
  // The staged file is handed straight through when it carries no metadata;
  // otherwise a cleaned copy is. Neither is ever read into memory.
  const original: AssetBytes = {
    path: source.path,
    size: source.size,
    hash: source.hash,
    owned: source.owned,
  };
  const cleanBytes = async () => {
    const cleaned = await stripAssetMetadata(source.path, extension, type);
    return cleaned ? await fileBytes(cleaned) : original;
  };

  if (type === AssetType.Video) {
    const inspected = await inspectVideoFile(source.path).catch(
      () => undefined,
    );
    if (!inspected?.width || !inspected.height) {
      throw createError({
        statusCode: 400,
        message: 'Invalid video file',
      });
    }
    return {
      bytes: await cleanBytes(),
      extension,
      type,
      dimensions: {
        width: inspected.width,
        height: inspected.height,
      },
      hasAudio: inspected.hasAudio,
      video: videoSourceInfo(inspected, source.size),
    };
  }

  if (type === AssetType.Image) {
    const dimensions = await getImageDimensions(source.path).catch(() => {
      throw createError({
        statusCode: 400,
        message: 'Invalid image file',
      });
    });
    return { bytes: await cleanBytes(), extension, type, dimensions };
  }

  return {
    bytes: await cleanBytes(),
    extension,
    type,
    dimensions: await inspectAssetDimensions(source.path, extension, type),
  };
}

export async function processFileZipAsset(
  source: AssetSourceFile,
  _settings: AssetFileZipSettings,
  options: AssetProcessOptions = {},
): Promise<ProcessedAsset> {
  const outputPath = theiTempPath(`thei-zip-out-${randomUUID()}.zip`);
  await zipFileToPath(source.path, source.size, source.extension, outputPath, {
    onProgress: options.onProgress,
  });
  return {
    bytes: await fileBytes(outputPath),
    extension: 'zip',
    type: AssetType.Other,
    dimensions: {},
  };
}

export async function processMediaTransformAsset(
  source: AssetSourceFile,
  settings: AssetTransformSettings,
  options: AssetProcessOptions = {},
): Promise<ProcessedAsset> {
  options.signal?.throwIfAborted();
  if (settings.type === 'image-transform') {
    return await processImage(source, settings);
  }
  return await processVideoToWebm(source, settings, options);
}

async function processImage(
  source: AssetSourceFile,
  settings: AssetImageTransformSettings,
): Promise<ProcessedAsset> {
  // sharp reads the staged file itself; the source never enters this process's
  // heap, and the encoded result is small enough to stay a buffer.
  // Encoding drops every embedded tag, so orientation is baked into the pixels
  // first or a rotated photo would come out sideways.
  const { dimensions } = settings;
  if (settings.format === 'svg') return await keepVector(source, settings);
  const raster = await rasterSource(source, settings);
  let pipeline = sharp(source.path, {
    animated: false,
    density: raster.density,
  }).autoOrient();
  // The admin's turn comes after the photo's own orientation, and sharp
  // applies both before an extract called later: the crop names a region of
  // the turned frame, which is what the editor showed.
  if (settings.rotation) pipeline = pipeline.rotate(settings.rotation);

  // Cropping before resizing, in that call order, makes sharp cut the region
  // from the oriented source first. The output size already has the crop's
  // proportions, so filling it distorts nothing.
  if (raster.crop) pipeline = pipeline.extract(raster.crop);
  pipeline = pipeline.resize(dimensions.width, dimensions.height, {
    fit: 'fill',
  });

  // `effort` is not comparable between the two encoders: WebP 6 is quick,
  // while AVIF climbs steeply past 4 for very little size. 4 is sharp's own
  // default and keeps a large upload from occupying a worker for minutes.
  // Lossy WebP is always 4:2:0; smart subsampling keeps coloured edges, such
  // as red text on white, from fringing.
  const encoded =
    settings.format === 'webp-lossless'
      ? pipeline.webp({ lossless: true, effort: 6 })
      : settings.format === 'webp'
        ? pipeline.webp({
            quality: settings.quality,
            effort: 6,
            smartSubsample: true,
          })
        : pipeline.avif({
            quality: imageDisplayQualityToAvifQuality(settings.quality),
            effort: 4,
          });

  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });

  return {
    bytes: { buffer: data },
    extension: assetImageFormatExtension(settings.format),
    type: AssetType.Image,
    dimensions: { width: info.width, height: info.height },
  };
}

/** Crops an SVG as an SVG: the drawing stays a vector at its new size. */
async function keepVector(
  source: AssetSourceFile,
  settings: AssetImageTransformSettings,
): Promise<ProcessedAsset> {
  const intrinsic = await sharp(source.path).metadata();
  const outputPath = theiTempPath(`thei-svg-out-${randomUUID()}.svg`);
  try {
    await cropSvgToFile(
      source.path,
      outputPath,
      {
        width: intrinsic.width ?? settings.dimensions.width,
        height: intrinsic.height ?? settings.dimensions.height,
      },
      settings.dimensions,
      settings.crop,
      settings.rotation,
      settings.stretch,
    );
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => {});
    throw error;
  }
  return {
    bytes: await fileBytes(outputPath),
    extension: 'svg',
    type: AssetType.Image,
    dimensions: { ...settings.dimensions },
  };
}

/**
 * How the source is rasterised, and the crop in that raster.
 *
 * A bitmap is used as it is. An SVG is drawn at the density the output needs,
 * so its crop — given in SVG units, which is what the editor measured — is
 * scaled into the pixels of that drawing.
 */
async function rasterSource(
  source: AssetSourceFile,
  settings: AssetImageTransformSettings,
): Promise<{ density?: number; crop?: AssetCropRect }> {
  const { crop, dimensions } = settings;
  if (source.extension.toLowerCase() !== 'svg') return { crop };

  const intrinsic = await sharp(source.path).metadata();
  // The crop and the output are both in the turned frame.
  const { width, height } = rotatedDimensions(
    {
      width: intrinsic.width ?? dimensions.width,
      height: intrinsic.height ?? dimensions.height,
    },
    settings.rotation,
  );
  const region = crop ?? { width, height };
  const density = svgRasterDensity(
    Math.max(
      dimensions.width / region.width,
      dimensions.height / region.height,
    ),
    Math.max(width, height),
  );
  if (!crop) return { density };

  const factor = density / SVG_BASE_DENSITY;
  const metadata = await sharp(source.path, { density }).metadata();
  const drawn =
    metadata.width && metadata.height
      ? rotatedDimensions(
          { width: metadata.width, height: metadata.height },
          settings.rotation,
        )
      : { width: undefined, height: undefined };
  return {
    density,
    crop: clampCropRect(
      {
        left: crop.left * factor,
        top: crop.top * factor,
        width: crop.width * factor,
        height: crop.height * factor,
      },
      {
        width: drawn.width ?? Math.round(width * factor),
        height: drawn.height ?? Math.round(height * factor),
      },
    ),
  };
}

async function processVideoToWebm(
  source: AssetSourceFile,
  settings: AssetVideoTransformSettings,
  options: AssetProcessOptions,
): Promise<ProcessedAsset> {
  const id = randomUUID();
  // ffmpeg reads the staged upload directly. It used to be written to a second
  // temp file from a buffer that held the whole video.
  const inputPath = source.path;
  const outputPath = theiTempPath(`thei-webm-out-${id}.webm`);

  const passlog = theiTempPath(`thei-vp9-${id}`);

  let succeeded = false;
  try {
    const inputInspection = await inspectVideoFile(inputPath).catch(
      () => undefined,
    );
    const inputDuration = inputInspection?.duration;
    const passes = buildVideoEncodePasses(
      settings,
      {
        width: inputInspection?.width ?? settings.dimensions.width,
        height: inputInspection?.height ?? settings.dimensions.height,
        hasAudio: Boolean(inputInspection?.hasAudio),
        ...(inputInspection
          ? videoSourceInfo(inputInspection, source.size)
          : {}),
      },
      passlog,
    );
    const inputArgs = [
      '-y',
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'info',
      '-stats',
    ];

    if (passes.first) {
      // The first pass only gathers statistics: its output goes to the null
      // muxer on stdout, which is why the progress pipe stays out of it and
      // the stderr counter is read instead.
      await runFfmpegWithProgress(
        [
          ...inputArgs,
          '-i',
          inputPath,
          ...splitFfmpegOptions(passes.first),
          '-',
        ],
        inputDuration,
        {
          ...options,
          onProgress: scaleProgress(options.onProgress, 0, FIRST_PASS_SHARE),
        },
      );
      options.signal?.throwIfAborted();
    }

    await runFfmpegWithProgress(
      [
        ...inputArgs,
        '-progress',
        'pipe:1',
        '-i',
        inputPath,
        ...splitFfmpegOptions(passes.second),
        outputPath,
      ],
      inputDuration,
      passes.first
        ? {
            ...options,
            onProgress: scaleProgress(
              options.onProgress,
              FIRST_PASS_SHARE,
              1 - FIRST_PASS_SHARE,
            ),
          }
        : options,
    );

    const inspected = await inspectVideoFile(outputPath).catch(() => undefined);
    const bytes = await fileBytes(outputPath);
    const result: ProcessedAsset = {
      bytes,
      extension: 'webm',
      type: AssetType.Video,
      dimensions: inspected
        ? {
            ...(inspected.width ? { width: inspected.width } : {}),
            ...(inspected.height ? { height: inspected.height } : {}),
          }
        : {},
      ...(inspected
        ? {
            hasAudio: inspected.hasAudio,
            video: videoSourceInfo(inspected, assetBytesSize(bytes)),
          }
        : {}),
    };
    succeeded = true;
    return result;
  } finally {
    // On success the output is handed to the caller, which moves it into the
    // library; the staged input belongs to the request and is cleaned up there.
    if (!succeeded) await rm(outputPath, { force: true }).catch(() => {});
    await rm(`${passlog}-0.log`, { force: true }).catch(() => {});
  }
}

/** How much of a two-pass encode's time the statistics pass takes. */
const FIRST_PASS_SHARE = 0.2;

/** Maps one pass's 0..1 onto its share of the whole encode's progress. */
export function scaleProgress(
  onProgress: ((progress: number) => void) | undefined,
  base: number,
  span: number,
): ((progress: number) => void) | undefined {
  if (!onProgress) return undefined;
  return (progress) => onProgress(base + progress * span);
}

/**
 * The bits per second of a video stream, from whatever the probe found.
 *
 * MP4 records each stream's rate; WebM and MKV record none, so the file's
 * overall rate less the sound stands in, and failing even that the size over
 * the duration.
 */
export function sourceVideoBitrate(
  inspection: VideoInspection,
  fileSize?: number,
): number | undefined {
  if (inspection.bitrate) return inspection.bitrate;
  const sound = inspection.hasAudio ? (inspection.audioBitrate ?? 128_000) : 0;
  const overall =
    inspection.overallBitrate ??
    (fileSize && inspection.duration
      ? (fileSize * 8) / inspection.duration
      : undefined);
  if (!overall) return undefined;
  const video = Math.round(overall - sound);
  return video > 0 ? video : undefined;
}

export function videoSourceInfo(
  inspection: VideoInspection,
  fileSize?: number,
): VideoSourceInfo {
  const bitrate = sourceVideoBitrate(inspection, fileSize);
  return {
    ...(inspection.duration ? { duration: inspection.duration } : {}),
    ...(inspection.fps ? { fps: inspection.fps } : {}),
    ...(bitrate ? { bitrate } : {}),
    ...(inspection.codec ? { codec: inspection.codec } : {}),
  };
}

async function readFfmpegInputInfo(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(
      ffmpegInstaller.path,
      ['-hide_banner', '-i', filePath],
      {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', () => {
      resolve(stderr);
    });
  });
}

/**
 * Reads what ffmpeg prints about an input.
 *
 * The stream line carries the coded size. A phone records portrait video as
 * landscape frames plus a rotation, and every player — ffmpeg's own transcode
 * included — shows it turned, so a quarter turn swaps the reported sides.
 */
export function parseFfmpegInputInfo(text: string): VideoInspection {
  const lines = text.split(/\r?\n/);
  const videoIndex = lines.findIndex((line) => /Stream #.*Video:/.test(line));
  const videoLine = lines[videoIndex];
  const audioLine = lines.find((line) => /Stream #.*Audio:/.test(line));
  const dimensionsMatch = videoLine?.match(/,\s*(\d{2,5})x(\d{2,5})(?:\s|,)/);
  const duration = parseDuration(text);
  const quarterTurned =
    videoIndex >= 0 && isQuarterTurn(videoStreamRotation(lines, videoIndex));
  const coded = dimensionsMatch
    ? { width: Number(dimensionsMatch[1]), height: Number(dimensionsMatch[2]) }
    : undefined;
  const fps = parseNumber(
    videoLine?.match(/,\s*(\d+(?:\.\d+)?)\s*fps\b/)?.[1] ??
      videoLine?.match(/,\s*(\d+(?:\.\d+)?)\s*tbr\b/)?.[1],
  );
  const bitrate = parseKilobits(videoLine);
  const audioBitrate = parseKilobits(audioLine);
  const overallBitrate = parseKilobits(
    text.match(/bitrate:\s*(\d+(?:\.\d+)?\s*kb\/s)/)?.[1],
  );
  const codec = videoLine?.match(/Video:\s*([A-Za-z0-9_-]+)/)?.[1];

  return {
    ...(coded
      ? quarterTurned
        ? { width: coded.height, height: coded.width }
        : coded
      : {}),
    ...(duration ? { duration } : {}),
    ...(fps ? { fps } : {}),
    ...(bitrate ? { bitrate } : {}),
    ...(overallBitrate ? { overallBitrate } : {}),
    ...(audioBitrate ? { audioBitrate } : {}),
    ...(codec ? { codec } : {}),
    hasAudio: Boolean(audioLine),
  };
}

/** A stream line's ", 850 kb/s" as bits per second. */
function parseKilobits(text: string | undefined): number | undefined {
  const value = parseNumber(text?.match(/(\d+(?:\.\d+)?)\s*kb\/s/)?.[1]);
  return value ? Math.round(value * 1000) : undefined;
}

function parseNumber(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The rotation recorded for the video stream, in degrees.
 *
 * Older ffmpeg prints it as a `rotate` metadata tag, newer ones as display
 * matrix side data; either sits in the lines under the stream until the next
 * stream begins.
 */
function videoStreamRotation(lines: string[], videoIndex: number): number {
  for (let index = videoIndex + 1; index < lines.length; index++) {
    const line = lines[index]!;
    if (/Stream #/.test(line)) break;
    const tag = line.match(/^\s*rotate\s*:\s*(-?\d+(?:\.\d+)?)/);
    if (tag) return Number(tag[1]);
    const matrix = line.match(
      /displaymatrix:\s*rotation of\s*(-?\d+(?:\.\d+)?)/,
    );
    if (matrix) return Number(matrix[1]);
  }
  return 0;
}

function isQuarterTurn(degrees: number): boolean {
  return Math.abs(Math.round(degrees)) % 180 === 90;
}

export interface VideoEncodePasses {
  /** The statistics pass, absent for a fast conversion. Writes no file. */
  first?: string[];
  /** The pass that writes the WebM. */
  second: string[];
}

/**
 * The ffmpeg output options of a video encode, one list per pass.
 *
 * The encoder is given a bitrate to hit rather than a quality to keep, so a
 * file's size is known before it is made: the ladder in
 * `videoTargetBitrate` picks the rate, and two passes let libvpx spread it
 * over the file rather than guess as it goes. A fast conversion is one
 * realtime pass at the same rate, which lands near it rather than on it.
 */
export function buildVideoEncodePasses(
  settings: AssetVideoTransformSettings,
  source: VideoBitrateSource & { hasAudio?: boolean },
  passlog: string,
): VideoEncodePasses {
  const target = videoTargetBitrate(
    settings.quality,
    settings.dimensions,
    source,
  );
  const stream = ['-map 0:v:0', '-map_metadata -1', '-map_chapters -1'];
  const sound =
    settings.stripAudio || source.hasAudio === false
      ? ['-an']
      : [
          '-map 0:a?',
          '-c:a libopus',
          `-b:a ${videoAudioBitrate(settings.quality)}`,
        ];
  const codec = [
    '-c:v libvpx-vp9',
    '-row-mt 1',
    '-tile-columns 2',
    `-b:v ${target}`,
    `-maxrate ${Math.round(target * 1.45)}`,
    `-bufsize ${target * 2}`,
  ];
  const filters = buildVideoScaleFilters(settings);
  const picture = [
    '-pix_fmt yuv420p',
    ...(filters.length ? [`-vf ${filters.join(',')}`] : []),
  ];

  if (settings.fastConversion) {
    return {
      second: [
        ...stream,
        ...sound,
        ...codec,
        '-deadline realtime',
        '-cpu-used 8',
        ...picture,
      ],
    };
  }

  return {
    first: [
      ...stream,
      '-an',
      ...codec,
      '-deadline good',
      '-cpu-used 4',
      '-pass 1',
      `-passlogfile ${passlog}`,
      ...picture,
      '-f null',
    ],
    second: [
      ...stream,
      ...sound,
      ...codec,
      '-deadline good',
      '-cpu-used 2',
      '-pass 2',
      `-passlogfile ${passlog}`,
      ...picture,
    ],
  };
}

async function runFfmpegWithProgress(
  args: string[],
  duration: number | undefined,
  options: AssetProcessOptions,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let progressBuffer = '';
    let errorOutput = '';
    let lastProgress = 0;
    if (duration) options.onProgress?.(0.01);

    const emitProgress = (progress: number) => {
      const nextProgress = Math.max(lastProgress, Math.min(progress, 0.99));
      lastProgress = nextProgress;
      options.onProgress?.(nextProgress);
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      progressBuffer += chunk;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const progress = parseProgressLine(line, duration);
        if (progress !== undefined) emitProgress(progress);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-8000);
      const hadDuration = Boolean(duration);
      const parsedDuration = parseDuration(errorOutput);
      if (parsedDuration) {
        duration = parsedDuration;
        if (!hadDuration) emitProgress(0.01);
      }
      const progress = parseStatsProgress(chunk, duration);
      if (progress !== undefined) emitProgress(progress);
    });

    const signal = options.signal;
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });

    child.on('error', (error) => {
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      if (code === 0) {
        options.onProgress?.(1);
        resolve();
        return;
      }
      reject(
        new Error(errorOutput.trim() || `ffmpeg exited with code ${code}`),
      );
    });
  });
}

function splitFfmpegOptions(options: string[]): string[] {
  const args: string[] = [];
  for (const option of options) {
    const firstSpace = option.indexOf(' ');
    if (firstSpace === -1) {
      args.push(option);
      continue;
    }
    args.push(option.slice(0, firstSpace), option.slice(firstSpace + 1));
  }
  return args;
}

function parseProgressLine(
  line: string,
  duration: number | undefined,
): number | undefined {
  if (!duration) return undefined;
  const separatorIndex = line.indexOf('=');
  if (separatorIndex === -1) return undefined;

  const key = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);

  if (key === 'progress' && value === 'end') return 1;

  const seconds =
    key === 'out_time_us' || key === 'out_time_ms'
      ? Number(value) / 1_000_000
      : key === 'out_time'
        ? parseTimemark(value)
        : undefined;

  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  return Math.max(0, Math.min(1, seconds / duration));
}

function parseStatsProgress(
  text: string,
  duration: number | undefined,
): number | undefined {
  if (!duration) return undefined;
  const matches = [...text.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
  const match = matches.at(-1);
  if (!match) return undefined;
  const seconds = parseTimemark(match[1]);
  return Math.max(0, Math.min(1, seconds / duration));
}

function parseDuration(text: string): number | undefined {
  const match = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
  return match ? parseTimemark(match[1]) : undefined;
}

function parseTimemark(timemark: string | undefined): number {
  if (!timemark) return 0;
  const match = timemark.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * The crop, then the scale to the exact output size.
 *
 * ffmpeg turns a rotated source upright before the filters run, so the crop is
 * in the same displayed space the editor showed. Both are already even.
 */
const VIDEO_ROTATION_FILTERS = {
  90: 'transpose=clock',
  180: 'hflip,vflip',
  270: 'transpose=cclock',
} as const;

export function buildVideoScaleFilters(
  settings: AssetVideoTransformSettings,
): string[] {
  const { rotation, crop, dimensions } = settings;
  const scaleFlags = settings.fastConversion ? 'fast_bilinear' : 'lanczos';
  return [
    // ffmpeg has already applied the file's own rotation; this is the admin's.
    ...(rotation ? [VIDEO_ROTATION_FILTERS[rotation]] : []),
    ...(crop
      ? [`crop=${crop.width}:${crop.height}:${crop.left}:${crop.top}`]
      : []),
    `scale=${dimensions.width}:${dimensions.height}:flags=${scaleFlags}`,
  ];
}
