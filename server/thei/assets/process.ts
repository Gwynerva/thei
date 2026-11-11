import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { createError } from 'h3';
import sharp, {
  type AvifOptions,
  type OutputInfo,
  type Sharp,
  type WebpOptions,
} from 'sharp';
import { theiTempPath } from './temp';
import { runFfmpeg } from './ffmpeg';
import {
  isHdr,
  probeMedia,
  unlessUnreadable,
  type VideoInspection,
} from './probe';
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
  imageDisplayQualityToWebpQuality,
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
import { withRasterReadySvg } from './svg-raster-input';
import { zipFileToPath } from './zip';
import { stripAssetMetadata } from './strip-metadata';

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO_EXTS = new Set<string>(AUDIO_EXTENSIONS);

export interface AssetDimensions {
  width?: number;
  height?: number;
}

export type { VideoInspection } from './probe';

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
  /** Of a video: its colour as tagged, for the frame that stands for it. */
  color?: VideoColorSource;
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

export async function inspectVideoFile(
  filePath: string,
): Promise<VideoInspection> {
  return await probeMedia(filePath);
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
    // Only ffprobe's own answer says the file is no good: missing tools are
    // said as such.
    const inspected = await inspectVideoFile(source.path).catch(
      unlessUnreadable,
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
      color: videoColor(inspected),
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

  // A recording or any other file: nothing of it has sides.
  return { bytes: await cleanBytes(), extension, type, dimensions: {} };
}

export async function processFileZipAsset(
  source: AssetSourceFile,
  _settings: AssetFileZipSettings,
  options: AssetProcessOptions = {},
): Promise<ProcessedAsset> {
  const outputPath = theiTempPath(`thei-zip-out-${randomUUID()}.zip`);
  await zipFileToPath(source.path, source.size, source.extension, outputPath, {
    onProgress: options.onProgress,
    signal: options.signal,
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

/**
 * What each encoder is asked for, at a quality of its own scale: the one
 * place that says it, read by the transform below and by the image quality
 * bench (`tests/bench/image-quality.test.ts`), which sweeps these very
 * settings.
 *
 * `effort` is not comparable between the two encoders, and the bench
 * (`bun run bench:media`, docs/media-quality.md) weighed each one: AVIF at
 * effort 3 is 4-5 times faster than at 4 for the same picture, the files
 * weighing what they did on real photographs; WebP at 4 is a sixth faster
 * than at 6 for the same bytes. Lossy WebP is always 4:2:0; smart subsampling
 * keeps coloured edges, such as red text on white, from fringing, and AVIF
 * stays 4:4:4, where 4:2:0 loses a decibel.
 */
export function avifEncodeOptions(quality: number): AvifOptions {
  return { quality, effort: 3 };
}

export function webpEncodeOptions(quality: number): WebpOptions {
  return { quality, effort: 4, smartSubsample: true };
}

export function webpLosslessEncodeOptions(): WebpOptions {
  return { lossless: true, effort: 4 };
}

/**
 * A started sharp encode cannot be stopped: there is no signal to hand it,
 * and it runs to the end in the thread pool. Callers check their signal
 * before starting it and again before storing what it made.
 */
async function processImage(
  source: AssetSourceFile,
  settings: AssetImageTransformSettings,
): Promise<ProcessedAsset> {
  if (settings.format === 'svg') return await keepVector(source, settings);
  const { data, info } = await withImagePipeline(
    source,
    settings,
    (pipeline) =>
      settings.format === 'webp-lossless'
        ? pipeline.webp(webpLosslessEncodeOptions())
        : settings.format === 'webp'
          ? pipeline.webp(
              webpEncodeOptions(
                imageDisplayQualityToWebpQuality(settings.quality),
              ),
            )
          : pipeline.avif(
              avifEncodeOptions(
                imageDisplayQualityToAvifQuality(settings.quality),
              ),
            ),
  );

  return {
    bytes: { buffer: data },
    extension: assetImageFormatExtension(settings.format),
    type: AssetType.Image,
    dimensions: { width: info.width, height: info.height },
  };
}

/**
 * The preview of an image transform, drawn from the source the transform
 * was made from rather than from its result: the same crop and turn at the
 * preview's size, read once more with shrink-on-load, where decoding the
 * finished AVIF again would take the whole picture at full size.
 */
export async function renderImagePreview(
  source: Pick<AssetSourceFile, 'path' | 'extension'>,
  settings: AssetImageTransformSettings,
  longSide: number,
  encode: (pipeline: Sharp) => Sharp,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const { width, height } = settings.dimensions;
  const scale = Math.min(1, longSide / Math.max(width, height));
  return await withImagePipeline(
    source,
    {
      ...settings,
      dimensions: {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      },
    },
    encode,
  );
}

/**
 * The source oriented, turned, cropped and resized as the settings say,
 * handed to `encode` for its last step.
 *
 * Decoding is the expensive part of a large photo, and libvips can decode a
 * JPEG already shrunk by 2, 4 or 8 — but only when nothing has to happen to
 * the full-size picture first: no crop before the resize, no turn before it.
 * So when the output is no larger than its crop, the whole frame is resized
 * by the crop's scale and the crop is cut out afterwards, in the turned
 * frame (sharp applies the orientation and the turn after the resize and
 * before a later extract, and sizes the resize in the turned frame). The
 * pixels come out the same; at the crop's edge they are even truer, as the
 * resampler sees the real neighbours instead of a clamped border. An
 * enlargement, which the settings allow a vector only, and an SVG, drawn at
 * a density of its own, keep the plain order: crop, then resize.
 *
 * A warning from the decoder — a mangled EXIF block, an odd ICC profile —
 * is not a reason to refuse a photo; a file cut short still is.
 */
async function withImagePipeline(
  source: Pick<AssetSourceFile, 'path' | 'extension'>,
  settings: AssetImageTransformSettings,
  encode: (pipeline: Sharp) => Sharp,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const { dimensions } = settings;
  const raster = await rasterSource(source, settings);
  const intrinsic =
    raster.density === undefined
      ? await getImageDimensions(source.path)
      : undefined;
  const plan =
    intrinsic?.width && intrinsic.height
      ? planResizeBeforeCrop(
          rotatedDimensions(
            { width: intrinsic.width, height: intrinsic.height },
            settings.rotation,
          ),
          raster.crop,
          dimensions,
        )
      : undefined;

  return await withRasterReadySvg(source.path, (input) => {
    let pipeline = sharp(input, {
      animated: false,
      density: raster.density,
      failOn: 'truncated',
    }).autoOrient();
    // The admin's turn comes after the photo's own orientation, and sharp
    // applies both before an extract called later: the crop names a region of
    // the turned frame, which is what the editor showed.
    if (settings.rotation) pipeline = pipeline.rotate(settings.rotation);

    if (plan) {
      pipeline = pipeline.resize(plan.width, plan.height, { fit: 'fill' });
      if (plan.crop) pipeline = pipeline.extract(plan.crop);
    } else {
      // Cropping before resizing, in that call order, makes sharp cut the
      // region from the oriented source first. The output size already has
      // the crop's proportions, so filling it distorts nothing.
      if (raster.crop) pipeline = pipeline.extract(raster.crop);
      pipeline = pipeline.resize(dimensions.width, dimensions.height, {
        fit: 'fill',
      });
    }
    return encode(pipeline).toBuffer({ resolveWithObject: true });
  });
}

type AssetDimensionsKnown = { width: number; height: number };

/**
 * The whole-frame resize that stands in for "crop, then resize" when the
 * output is no larger than its crop: the frame scaled by the crop's scale,
 * and the crop in that scaled frame. Nothing when the output would enlarge
 * the crop on either side.
 */
export function planResizeBeforeCrop(
  frame: AssetDimensionsKnown,
  crop: AssetCropRect | undefined,
  output: AssetDimensionsKnown,
): { width: number; height: number; crop?: AssetCropRect } | undefined {
  if (!crop) {
    return output.width <= frame.width && output.height <= frame.height
      ? { width: output.width, height: output.height }
      : undefined;
  }
  const scaleX = output.width / crop.width;
  const scaleY = output.height / crop.height;
  if (scaleX > 1 || scaleY > 1) return undefined;
  const width = Math.max(output.width, Math.round(frame.width * scaleX));
  const height = Math.max(output.height, Math.round(frame.height * scaleY));
  return {
    width,
    height,
    crop: {
      left: Math.min(Math.round(crop.left * scaleX), width - output.width),
      top: Math.min(Math.round(crop.top * scaleY), height - output.height),
      width: output.width,
      height: output.height,
    },
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
  source: Pick<AssetSourceFile, 'path' | 'extension'>,
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
    const inputInspection =
      await inspectVideoFile(inputPath).catch(unlessUnreadable);
    const inputDuration = inputInspection?.duration;
    const passes = buildVideoEncodePasses(
      settings,
      {
        width: inputInspection?.width ?? settings.dimensions.width,
        height: inputInspection?.height ?? settings.dimensions.height,
        // Unknown when the probe failed: the sound is then mapped if there
        // is any (`-map 0:a?`), never dropped for want of an answer.
        hasAudio: inputInspection?.hasAudio,
        ...(inputInspection
          ? videoSourceInfo(inputInspection, source.size)
          : {}),
        ...videoColor(inputInspection),
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

    const inspected =
      await inspectVideoFile(outputPath).catch(unlessUnreadable);
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
            color: videoColor(inspected),
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

export interface VideoEncodePasses {
  /** The statistics pass. Writes no file. */
  first: string[];
  /** The pass that writes the WebM. */
  second: string[];
}

/**
 * The ffmpeg output options of a video encode, one list per pass.
 *
 * The encoder is given a bitrate to hit rather than a quality to keep, so a
 * file's size is known before it is made: the ladder in
 * `videoTargetBitrate` picks the rate, and two passes let libvpx spread it
 * over the file rather than guess as it goes. Both passes run at `cpu-used
 * 4`: the bench found the second at 2 twice as slow for half a VMAF point,
 * and a single pass — good or realtime — anywhere from 0.83 to 3.2 of the
 * rate it was given, so there is none.
 */
export function buildVideoEncodePasses(
  settings: AssetVideoTransformSettings,
  source: VideoBitrateSource & { hasAudio?: boolean } & VideoColorSource,
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
  const filters = buildVideoScaleFilters(settings, source);
  const picture = [
    '-pix_fmt yuv420p',
    ...(filters.length ? [`-vf ${filters.join(',')}`] : []),
    // Mapped down from HDR, the picture is BT.709 now, and the file says so;
    // an SDR source keeps whatever tags it came with.
    ...(isHdr(source)
      ? [
          '-colorspace bt709',
          '-color_primaries bt709',
          '-color_trc bt709',
          '-color_range tv',
        ]
      : []),
  ];

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
      '-cpu-used 4',
      '-pass 2',
      `-passlogfile ${passlog}`,
      ...picture,
    ],
  };
}

export async function runFfmpegWithProgress(
  args: string[],
  duration: number | undefined,
  options: AssetProcessOptions,
) {
  let progressBuffer = '';
  let errorOutput = '';
  let lastProgress = 0;
  if (duration) options.onProgress?.(0.01);

  const emitProgress = (progress: number) => {
    const nextProgress = Math.max(lastProgress, Math.min(progress, 0.99));
    lastProgress = nextProgress;
    options.onProgress?.(nextProgress);
  };

  const code = await runFfmpeg(args, {
    signal: options.signal,
    onStdout: (chunk) => {
      progressBuffer += chunk.toString('utf8');
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const progress = parseProgressLine(line, duration);
        if (progress !== undefined) emitProgress(progress);
      }
    },
    onStderr: (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-8000);
      const hadDuration = Boolean(duration);
      const parsedDuration = parseDuration(errorOutput);
      if (parsedDuration) {
        duration = parsedDuration;
        if (!hadDuration) emitProgress(0.01);
      }
      const progress = parseStatsProgress(chunk, duration);
      if (progress !== undefined) emitProgress(progress);
    },
  });
  if (code !== 0)
    throw new Error(errorOutput.trim() || `ffmpeg exited with code ${code}`);
  options.onProgress?.(1);
}

export function splitFfmpegOptions(options: string[]): string[] {
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
  source: VideoColorSource = {},
): string[] {
  const { rotation, crop, dimensions } = settings;
  return [
    // ffmpeg has already applied the file's own rotation; this is the admin's.
    ...(rotation ? [VIDEO_ROTATION_FILTERS[rotation]] : []),
    ...(crop
      ? [`crop=${crop.width}:${crop.height}:${crop.left}:${crop.top}`]
      : []),
    `scale=${dimensions.width}:${dimensions.height}:flags=lanczos`,
    // The colour work runs on the frame already made small.
    ...videoColorFilters(source),
  ];
}

/**
 * What of a source's colour the encode and the frame grab need to know, as
 * ffprobe names it: the transfer, the primaries, the matrix.
 */
export interface VideoColorSource {
  colorTransfer?: string;
  colorPrimaries?: string;
  colorSpace?: string;
}

/** The colour a probe found, and nothing else of it. */
export function videoColor(
  inspection: VideoColorSource | undefined,
): VideoColorSource {
  return {
    ...(inspection?.colorTransfer
      ? { colorTransfer: inspection.colorTransfer }
      : {}),
    ...(inspection?.colorPrimaries
      ? { colorPrimaries: inspection.colorPrimaries }
      : {}),
    ...(inspection?.colorSpace ? { colorSpace: inspection.colorSpace } : {}),
  };
}

/**
 * The primaries and matrices zscale reads, by ffprobe's names. Anything
 * else — `unknown`, `reserved`, or no tag at all — is taken for BT.2020,
 * which PQ and HLG are recorded in.
 */
const ZSCALE_PRIMARIES = new Set([
  'bt709',
  'bt470m',
  'bt470bg',
  'smpte170m',
  'smpte240m',
  'film',
  'bt2020',
  'smpte428',
  'smpte431',
  'smpte432',
  'ebu3213',
  'jedec-p22',
]);
const ZSCALE_MATRICES = new Set([
  'bt709',
  'fcc',
  'bt470bg',
  'smpte170m',
  'smpte240m',
  'ycgco',
  'bt2020nc',
  'bt2020c',
  'chroma-derived-nc',
  'chroma-derived-c',
  'ictcp',
]);

/**
 * Brings an HDR picture — PQ or HLG, what phones record now — into the
 * BT.709 SDR every browser shows: to linear light, into BT.709 primaries,
 * the highlights rolled off (Hable's curve, the hues kept), and back into
 * video levels. Without this the frames would be read as if they were SDR
 * already: grey, flat, every colour washed out. An SDR source needs none of
 * it; a ten-bit SDR one is only brought to eight bits, by the output's
 * pixel format.
 *
 * zscale is told what the source is rather than left to read it from the
 * frames: a file tagged with its transfer alone, its primaries and matrix
 * unspecified, finds no path between colour spaces otherwise, and then not
 * a single frame comes out — no encode, and no still either. The first step
 * keeps the primaries it was told, so that the next one has them to map.
 */
export function videoColorFilters(source: VideoColorSource): string[] {
  if (!isHdr(source)) return [];
  const primaries = ZSCALE_PRIMARIES.has(source.colorPrimaries ?? '')
    ? source.colorPrimaries
    : 'bt2020';
  const matrix = ZSCALE_MATRICES.has(source.colorSpace ?? '')
    ? source.colorSpace
    : 'bt2020nc';
  return [
    `zscale=tin=${source.colorTransfer}:pin=${primaries}:min=${matrix}` +
      `:t=linear:p=${primaries}:npl=100`,
    'format=gbrpf32le',
    'zscale=p=bt709',
    'tonemap=tonemap=hable:desat=0',
    'zscale=t=bt709:m=bt709:r=tv',
    'format=yuv420p',
  ];
}
