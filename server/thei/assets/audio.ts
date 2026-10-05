import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { createError } from 'h3';
import { AssetType, type AudioAssetMeta } from '#layers/thei/shared/asset';
import { audioTargetBitrate } from '#layers/thei/shared/asset-upload-quality';
import type {
  AssetAudioSource,
  AssetAudioTransformSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { AUDIO_OUTPUT_EXTENSION } from '#layers/thei/shared/audio';
import { WAVEFORM_SAMPLE_RATE, WaveformAccumulator } from './audio-waveform';
import { fileBytes } from './bytes';
import {
  parseFfmpegInputInfo,
  readFfmpegInputInfo,
  runFfmpegWithProgress,
  type AssetProcessOptions,
  type AssetSourceFile,
  type ProcessedAsset,
  type VideoInspection,
} from './process';
import { withProcessingSlot } from './queue';
import type { StoredAssetRecord } from './storage';
import { theiTempPath } from './temp';

/** What ffmpeg says about a file, which must have a sound stream. */
export async function inspectAudioFile(
  filePath: string,
): Promise<VideoInspection> {
  const inspection = parseFfmpegInputInfo(
    await readFfmpegInputInfo(filePath).catch(() => ''),
  );
  if (!inspection.hasAudio) {
    throw createError({ statusCode: 400, message: 'Invalid audio file' });
  }
  return inspection;
}

/**
 * The bits per second of a recording's sound. A WebM or Ogg records no rate
 * per stream; with no picture in the file, the file's own rate is the
 * sound's, and failing even that, the size over the length.
 */
export function audioSourceInfo(
  inspection: VideoInspection,
  fileSize?: number,
): AssetAudioSource {
  const bitrate =
    inspection.audioBitrate ??
    (inspection.width
      ? undefined
      : (inspection.overallBitrate ??
        (fileSize && inspection.duration
          ? Math.round((fileSize * 8) / inspection.duration)
          : undefined)));
  return {
    ...(inspection.duration ? { duration: inspection.duration } : {}),
    ...(bitrate ? { bitrate } : {}),
    ...(inspection.audioCodec ? { codec: inspection.audioCodec } : {}),
    ...(inspection.channels ? { channels: inspection.channels } : {}),
  };
}

/** What an audio transform needs to know about its source, read from it. */
export async function probeAudioSource(
  source: Pick<AssetSourceFile, 'path' | 'size'>,
): Promise<AssetAudioSource> {
  return audioSourceInfo(await inspectAudioFile(source.path), source.size);
}

/**
 * The ffmpeg arguments of a recording's encode.
 *
 * Only the first sound stream is kept: cover pictures, chapters and tags are
 * left behind, and `bitexact` keeps ffmpeg's own name and version out of the
 * bytes, so one source and one recipe always make one file. Anything with
 * more than two channels is folded into stereo: a surround mix is not what a
 * page plays, and Safari plays Opus only in one or two. ffmpeg does not know
 * `weba`, so the muxer is named.
 */
export function buildAudioEncodeArgs(
  inputPath: string,
  outputPath: string,
  settings: AssetAudioTransformSettings,
  source: AssetAudioSource,
): string[] {
  return [
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
    '-map',
    '0:a:0',
    '-vn',
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-c:a',
    'libopus',
    '-b:a',
    String(audioTargetBitrate(settings.quality, settings.mono, source)),
    '-vbr',
    'on',
    '-ar',
    '48000',
    '-ac',
    settings.mono ? '1' : '2',
    '-fflags',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    '-f',
    'webm',
    outputPath,
  ];
}

export async function processAudioToOpus(
  source: AssetSourceFile,
  settings: AssetAudioTransformSettings,
  options: AssetProcessOptions = {},
): Promise<ProcessedAsset> {
  options.signal?.throwIfAborted();
  const info = await probeAudioSource(source);
  const outputPath = theiTempPath(
    `thei-opus-out-${randomUUID()}.${AUDIO_OUTPUT_EXTENSION}`,
  );
  let succeeded = false;
  try {
    await runFfmpegWithProgress(
      buildAudioEncodeArgs(source.path, outputPath, settings, info),
      info.duration,
      options,
    );
    const bytes = await fileBytes(outputPath);
    succeeded = true;
    return {
      bytes,
      extension: AUDIO_OUTPUT_EXTENSION,
      type: AssetType.Audio,
      dimensions: {},
    };
  } finally {
    // On success the output is handed to the caller, which moves it into the
    // library; the staged input belongs to the request and is cleaned up there.
    if (!succeeded) await rm(outputPath, { force: true }).catch(() => {});
  }
}

export interface AudioDetails {
  inspection: VideoInspection;
  /** Seconds, from the samples decoded rather than from the header. */
  duration: number;
  peaks: number[];
}

/** What ffmpeg prints about the input, before it turns to the output. */
const PROBE_HEAD_LIMIT = 16 * 1024;

/**
 * Decodes a recording once to learn what a player draws: its length, from
 * the samples themselves (an MP3's header may only guess it), and its
 * waveform. ffmpeg writes small mono PCM to a pipe that is measured as it
 * flows; nothing holds the file, or the sound, as a whole.
 */
export async function readAudioDetails(
  filePath: string,
  options: { signal?: AbortSignal } = {},
): Promise<AudioDetails> {
  options.signal?.throwIfAborted();
  const waveform = new WaveformAccumulator();
  const { head, code } = await new Promise<{
    head: string;
    code: number | null;
  }>((resolve, reject) => {
    const child = spawn(
      ffmpegInstaller.path,
      [
        '-hide_banner',
        '-nostdin',
        '-i',
        filePath,
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(WAVEFORM_SAMPLE_RATE),
        '-c:a',
        'pcm_s16le',
        '-f',
        's16le',
        'pipe:1',
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let head = '';
    child.stdout.on('data', (chunk: Buffer) => waveform.push(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (head.length < PROBE_HEAD_LIMIT) head += chunk;
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
      if (signal?.aborted) reject(signal.reason);
      else resolve({ head, code });
    });
  });
  if (code !== 0 || !waveform.samples) {
    throw createError({ statusCode: 400, message: 'Invalid audio file' });
  }
  return {
    inspection: parseFfmpegInputInfo(head.split(/^Stream mapping:/m)[0]!),
    duration:
      Math.round((waveform.samples / WAVEFORM_SAMPLE_RATE) * 1000) / 1000,
    peaks: waveform.finish(),
  };
}

export function audioMetaFromDetails(
  details: AudioDetails,
  fileSize: number,
): AudioAssetMeta {
  const { bitrate, channels } = audioSourceInfo(
    { ...details.inspection, duration: details.duration },
    fileSize,
  );
  return {
    duration: details.duration,
    peaks: details.peaks,
    ...(channels ? { channels } : {}),
    ...(bitrate ? { bitrate } : {}),
  };
}

/** Reads a stored or staged recording into what its row keeps about it. */
export async function readAudioMeta(
  filePath: string,
  fileSize: number,
  options: { signal?: AbortSignal } = {},
): Promise<AudioAssetMeta> {
  return audioMetaFromDetails(
    await readAudioDetails(filePath, options),
    fileSize,
  );
}

/**
 * Recordings stored before their length and waveform were kept: originals
 * from 0.0.3 and earlier, and files a newer version recognises as sound. The
 * oldest-touched go first.
 */
export async function findAudioWithoutWaveforms(): Promise<
  StoredAssetRecord[]
> {
  const { db, schema } = THEI_SERVER.useDb();
  return await db
    .select()
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.type, AssetType.Audio),
        isNotNull(schema.assets.settings),
        sql`json_extract(${schema.assets.meta}, '$.peaks') IS NULL`,
      ),
    )
    .orderBy(schema.assets.touchedAt);
}

export interface CompleteAudioMetasOptions {
  /** Told after each file, and once before the first. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

/**
 * Reads the length and waveform of every recording that has none, one at a
 * time in the sound lane. A file that cannot be read gets an empty waveform
 * and no length, and is named in the result rather than failing the rest:
 * its player still plays what the browser can, and asks the file its length.
 */
export async function completeAudioMetas(
  options: CompleteAudioMetasOptions = {},
): Promise<{ total: number; unreadable: StoredAssetRecord[] }> {
  const assets = await findAudioWithoutWaveforms();
  const unreadable: StoredAssetRecord[] = [];
  await options.onProgress?.(0, assets.length);
  let done = 0;
  for (const asset of assets) {
    const filePath = THEI_SERVER.assets.filePath(
      asset.contentHash,
      asset.extension,
    );
    const read = await withProcessingSlot(AssetType.Audio, () =>
      readAudioMeta(filePath, asset.size),
    ).catch(() => undefined);
    if (!read) unreadable.push(asset);
    const meta: AudioAssetMeta = {
      ...((asset.meta as Partial<AudioAssetMeta> | null) ?? {}),
      ...(read ?? { duration: 0, peaks: [] }),
    };
    await THEI_SERVER.assets.update(asset.assetUuid, { meta });
    done += 1;
    await options.onProgress?.(done, assets.length);
  }
  return { total: assets.length, unreadable };
}
