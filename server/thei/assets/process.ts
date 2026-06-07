import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import {
  AUDIO_EXTENSIONS,
  AssetType,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from '#layers/thei/shared/asset';
import type {
  AssetFileZipSettings,
  AssetImageTransformSettings,
  AssetTransformSettings,
  AssetVideoTransformSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { videoQualityToVp9Crf } from '#layers/thei/shared/asset-upload-quality';
import { zipSingleFile } from './zip';

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
}

export interface ProcessedAsset {
  buffer: Buffer;
  extension: string;
  type: AssetType;
  dimensions: AssetDimensions;
  hasAudio?: boolean;
}

export interface AssetProcessOptions {
  onProgress?: (progress: number) => void;
}

export function inferAssetType(extension: string): AssetType {
  if (IMAGE_EXTS.has(extension)) return AssetType.Image;
  if (VIDEO_EXTS.has(extension)) return AssetType.Video;
  if (AUDIO_EXTS.has(extension)) return AssetType.Audio;
  return AssetType.Other;
}

export async function getImageDimensions(
  buffer: Buffer,
): Promise<AssetDimensions> {
  const metadata = await sharp(buffer).metadata();
  return {
    ...(metadata.width ? { width: metadata.width } : {}),
    ...(metadata.height ? { height: metadata.height } : {}),
  };
}

export async function inspectVideo(buffer: Buffer): Promise<VideoInspection> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `thei-probe-in-${id}`);

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
  buffer: Buffer,
): Promise<AssetDimensions> {
  const { width, height } = await inspectVideo(buffer);
  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

export async function inspectAssetDimensions(
  buffer: Buffer,
  extension: string,
  type: AssetType,
): Promise<AssetDimensions> {
  if (type === AssetType.Image) {
    return await getImageDimensions(buffer).catch(() => ({}));
  }
  if (type === AssetType.Video) {
    return await getVideoDimensions(buffer).catch(() => ({}));
  }
  return {};
}

export async function processOriginalAsset(
  inputBuffer: Buffer,
  originalExtension: string,
): Promise<ProcessedAsset> {
  const extension = originalExtension.toLowerCase();
  const type = inferAssetType(extension);
  if (type === AssetType.Video) {
    const inspected = await inspectVideo(inputBuffer).catch(() => undefined);
    return {
      buffer: inputBuffer,
      extension,
      type,
      dimensions: inspected
        ? {
            ...(inspected.width ? { width: inspected.width } : {}),
            ...(inspected.height ? { height: inspected.height } : {}),
          }
        : {},
      ...(inspected ? { hasAudio: inspected.hasAudio } : {}),
    };
  }

  return {
    buffer: inputBuffer,
    extension,
    type,
    dimensions: await inspectAssetDimensions(inputBuffer, extension, type),
  };
}

export async function processFileZipAsset(
  inputBuffer: Buffer,
  originalFilename: string,
  _settings: AssetFileZipSettings,
  options: AssetProcessOptions = {},
): Promise<ProcessedAsset> {
  return {
    buffer: await zipSingleFile(inputBuffer, originalFilename, {
      onProgress: options.onProgress,
    }),
    extension: 'zip',
    type: AssetType.Other,
    dimensions: {},
  };
}

export async function processMediaTransformAsset(
  inputBuffer: Buffer,
  settings: AssetTransformSettings,
  options: AssetProcessOptions = {},
): Promise<ProcessedAsset> {
  if (settings.type === 'image-transform') {
    return await processImageToWebp(inputBuffer, settings);
  }
  return await processVideoToWebm(inputBuffer, settings, options);
}

async function processImageToWebp(
  inputBuffer: Buffer,
  settings: AssetImageTransformSettings,
): Promise<ProcessedAsset> {
  let pipeline = sharp(inputBuffer, { animated: false });
  const width = settings.dimensions.width;
  const height = settings.dimensions.height;

  if (width || height) {
    pipeline = pipeline.resize(width, height, {
      fit: settings.resizeMode,
      withoutEnlargement: !settings.allowUpscale,
    });
  }

  const { data, info } = await pipeline
    .webp({ quality: settings.quality, effort: 6 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    extension: 'webp',
    type: AssetType.Image,
    dimensions: { width: info.width, height: info.height },
  };
}

async function processVideoToWebm(
  inputBuffer: Buffer,
  settings: AssetVideoTransformSettings,
  options: AssetProcessOptions,
): Promise<ProcessedAsset> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `thei-webm-in-${id}`);
  const outputPath = join(tmpdir(), `thei-webm-out-${id}.webm`);

  try {
    await writeFile(inputPath, inputBuffer);
    const inputInspection = await inspectVideoFile(inputPath).catch(
      () => undefined,
    );
    const inputDuration = inputInspection?.duration;
    const shouldStripAudio = settings.stripAudio || !inputInspection?.hasAudio;

    const outputOptions = [
      '-map 0:v:0',
      ...(shouldStripAudio
        ? ['-an']
        : ['-map 0:a?', '-c:a libopus', '-b:a 128k']),
      ...buildVideoCodecOptions(settings),
      '-pix_fmt yuv420p',
    ];

    const videoFilters = buildVideoScaleFilters(settings);
    if (videoFilters.length > 0) {
      outputOptions.push(`-vf ${videoFilters.join(',')}`);
    }

    await runFfmpegWithProgress(
      [
        '-y',
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'info',
        '-stats',
        '-progress',
        'pipe:1',
        '-i',
        inputPath,
        ...splitFfmpegOptions(outputOptions),
        outputPath,
      ],
      inputDuration,
      outputPath,
      options,
    );

    const buffer = await readFile(outputPath);
    const inspected = await inspectVideo(buffer).catch(() => undefined);
    return {
      buffer,
      extension: 'webm',
      type: AssetType.Video,
      dimensions: inspected
        ? {
            ...(inspected.width ? { width: inspected.width } : {}),
            ...(inspected.height ? { height: inspected.height } : {}),
          }
        : {},
      ...(inspected ? { hasAudio: inspected.hasAudio } : {}),
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
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

function parseFfmpegInputInfo(text: string): VideoInspection {
  const videoLine = text
    .split(/\r?\n/)
    .find((line) => /Stream #.*Video:/.test(line));
  const dimensionsMatch = videoLine?.match(/,\s*(\d{2,5})x(\d{2,5})(?:\s|,)/);
  const duration = parseDuration(text);

  return {
    ...(dimensionsMatch
      ? {
          width: Number(dimensionsMatch[1]),
          height: Number(dimensionsMatch[2]),
        }
      : {}),
    ...(duration ? { duration } : {}),
    hasAudio: /Stream #.*Audio:/.test(text),
  };
}

function buildVideoCodecOptions(
  settings: AssetVideoTransformSettings,
): string[] {
  if (settings.fastConversion) {
    return [
      '-c:v libvpx-vp9',
      '-deadline realtime',
      '-cpu-used 8',
      '-row-mt 1',
      '-b:v 0',
      `-crf ${videoQualityToVp9Crf(settings.quality)}`,
    ];
  }

  return [
    '-c:v libvpx-vp9',
    '-deadline good',
    '-cpu-used 2',
    '-row-mt 1',
    '-b:v 0',
    `-crf ${videoQualityToVp9Crf(settings.quality)}`,
  ];
}

async function runFfmpegWithProgress(
  args: string[],
  duration: number | undefined,
  outputPath: string,
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
    let isProbingOutput = false;
    if (duration) options.onProgress?.(0.01);

    const emitProgress = (progress: number) => {
      const nextProgress = Math.max(lastProgress, Math.min(progress, 0.99));
      lastProgress = nextProgress;
      options.onProgress?.(nextProgress);
    };

    const probeTimer =
      duration &&
      setInterval(() => {
        if (isProbingOutput) return;
        isProbingOutput = true;
        inspectVideoFile(outputPath)
          .then((inspection) => {
            if (inspection.duration) {
              emitProgress(inspection.duration / duration);
            }
          })
          .catch(() => {})
          .finally(() => {
            isProbingOutput = false;
          });
      }, 500);

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

    child.on('error', (error) => {
      if (probeTimer) clearInterval(probeTimer);
      reject(error);
    });
    child.on('close', (code) => {
      if (probeTimer) clearInterval(probeTimer);
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

function buildVideoScaleFilters(
  settings: AssetVideoTransformSettings,
): string[] {
  const width = settings.dimensions.width;
  const height = settings.dimensions.height;
  const scaleFlags = settings.fastConversion ? 'fast_bilinear' : 'lanczos';

  if (!width && !height) {
    return [];
  }

  if (width && height) {
    const widthExpression = settings.allowUpscale
      ? String(width)
      : `min(${width}\\,iw)`;
    const heightExpression = settings.allowUpscale
      ? String(height)
      : `min(${height}\\,ih)`;
    if (settings.resizeMode === 'cover') {
      return [
        `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=${scaleFlags}`,
        `crop=${width}:${height}`,
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      ];
    }

    return [
      `scale='${widthExpression}':'${heightExpression}':force_original_aspect_ratio=decrease:flags=${scaleFlags}`,
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    ];
  }

  if (width) {
    return [
      `scale='${settings.allowUpscale ? width : `min(${width}\\,iw)`}':-2:flags=${scaleFlags}`,
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    ];
  }

  return [
    `scale=-2:'${settings.allowUpscale ? height : `min(${height}\\,ih)`}':flags=${scaleFlags}`,
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
  ];
}
