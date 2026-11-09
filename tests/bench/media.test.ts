import { cpus, totalmem } from 'node:os';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  buildVideoEncodePasses,
  splitFfmpegOptions,
  videoColor,
  videoSourceInfo,
} from '../../server/thei/assets/process';
import { probeMedia } from '../../server/thei/assets/probe';
import { readAudioDetails } from '../../server/thei/assets/audio';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  ASSET_QUALITY_LEVELS,
  AVIF_QUALITY_BY_LEVEL,
  type AssetQualityLevel,
} from '../../shared/asset-quality-levels';
import { videoTargetBitrate } from '../../shared/asset-upload-quality';
import type { AssetVideoTransformSettings } from '../../shared/asset-upload-settings';
import { toolVersion } from '../../update/ffmpeg/install';
import { resolveFfmpegTools } from '../../update/ffmpeg/tools';
import {
  compareImages,
  compareVideos,
  makeClip,
  makePhoto,
  makeRecording,
  runFfmpeg,
} from '../helpers/media';

/**
 * How long the media pipeline takes, and what each knob buys: `bun run
 * bench:media`, then read `tests/.artifacts/media-bench/report.md`. On a
 * box like a small VPS: `bun run bench:media:docker --cpus 1`.
 *
 * Not a test of anything — it only runs when asked for — but the one place
 * where a change to an encoder's settings is weighed in numbers: time,
 * bytes, and how close the result stays to the source (SSIM and PSNR for
 * pictures, VMAF too for video).
 *
 *   THEI_MEDIA_BENCH=1          runs it
 *   THEI_MEDIA_BENCH_SOURCES    a directory of the owner's own photos, videos
 *                               and recordings to use instead of synthetic ones
 *   THEI_MEDIA_BENCH_SECONDS    how much of each video to encode (default 20)
 *   THEI_MEDIA_BENCH_QUICK=1    fewer levels, no lossless, short clips
 *   THEI_MEDIA_BENCH_LABEL      a suffix for the report's file name
 */
const enabled = Boolean(process.env.THEI_MEDIA_BENCH);
const quick = Boolean(process.env.THEI_MEDIA_BENCH_QUICK);
const clipSeconds =
  Number(process.env.THEI_MEDIA_BENCH_SECONDS) || (quick ? 5 : 20);
const label = process.env.THEI_MEDIA_BENCH_LABEL;
const output = join(import.meta.dirname, '..', '.artifacts', 'media-bench');

interface Row {
  group: string;
  source: string;
  variant: string;
  ms: number;
  bytes?: number;
  ssim?: number;
  psnr?: number;
  vmaf?: number;
  /** Encoded seconds per second of work, for video and sound. */
  speed?: number;
  /** Bytes against the size the estimate promised, for video. */
  ofTarget?: number;
  note?: string;
}

const rows: Row[] = [];
let root = '';
let sources: {
  photos: string[];
  clips: string[];
  recordings: string[];
};

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - started), value };
}

function levels(): AssetQualityLevel[] {
  return quick ? ['low', 'medium', 'high'] : [...ASSET_QUALITY_LEVELS];
}

async function gatherSources() {
  const dir = process.env.THEI_MEDIA_BENCH_SOURCES;
  if (dir) {
    const names = await readdir(dir);
    const of = (extensions: string[]) =>
      names
        .filter((name) => extensions.includes(extname(name).toLowerCase()))
        .map((name) => join(dir, name));
    return {
      photos: of(['.jpg', '.jpeg', '.png']),
      clips: of(['.mp4', '.mov', '.mkv', '.webm', '.m4v']),
      recordings: of(['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.weba']),
    };
  }
  const photos = [
    (
      await makePhoto(join(root, 'photo-24mp.jpg'), {
        width: 6000,
        height: 4000,
      })
    ).path,
    ...(quick
      ? []
      : [
          (
            await makePhoto(join(root, 'photo-12mp.jpg'), {
              width: 4000,
              height: 3000,
            })
          ).path,
        ]),
  ];
  const clips = [
    (await makeClip(join(root, 'clip-1080p.mp4'), { seconds: clipSeconds }))
      .path,
    ...(quick
      ? []
      : [
          (
            await makeClip(join(root, 'clip-4k.mp4'), {
              width: 3840,
              height: 2160,
              seconds: Math.min(clipSeconds, 10),
            })
          ).path,
        ]),
  ];
  const recordings = [
    (
      await makeRecording(join(root, 'voice.wav'), {
        seconds: quick ? 30 : 180,
      })
    ).path,
  ];
  return { photos, clips, recordings };
}

beforeAll(async () => {
  if (!enabled) return;
  root = await mkdtemp(join(tmpdir(), 'thei-media-bench-'));
  await mkdir(output, { recursive: true });
  sources = await gatherSources();
}, 1_800_000);

afterAll(async () => {
  if (!enabled) return;
  await writeReport();
  await rm(root, { recursive: true, force: true });
});

describe.runIf(enabled)('media bench', () => {
  it('decodes photos, whole and shrunk on load', async () => {
    for (const photo of sources.photos) {
      const meta = await sharp(photo).metadata();
      const long = Math.max(meta.width ?? 0, meta.height ?? 0);
      const crop = {
        left: Math.round((meta.width ?? 0) * 0.1),
        top: Math.round((meta.height ?? 0) * 0.1),
        width: Math.round((meta.width ?? 0) * 0.8),
        height: Math.round((meta.height ?? 0) * 0.8),
      };
      const target = {
        width: 1600,
        height: Math.round((1600 * crop.height) / crop.width),
      };
      const name = basename(photo);
      for (const [variant, make] of [
        ['decode whole', () => sharp(photo).autoOrient().raw().toBuffer()],
        [
          'crop, then resize to 1600 (the old order)',
          () =>
            sharp(photo)
              .autoOrient()
              .extract(crop)
              .resize(target.width, target.height, { fit: 'fill' })
              .raw()
              .toBuffer(),
        ],
        [
          'resize, then crop to 1600 (shrink on load)',
          () => {
            const scale = target.width / crop.width;
            const width = Math.max(
              target.width,
              Math.round((meta.width ?? 0) * scale),
            );
            const height = Math.max(
              target.height,
              Math.round((meta.height ?? 0) * scale),
            );
            return sharp(photo)
              .autoOrient()
              .resize(width, height, { fit: 'fill' })
              .extract({
                left: Math.min(
                  Math.round(crop.left * scale),
                  width - target.width,
                ),
                top: Math.min(
                  Math.round(crop.top * scale),
                  height - target.height,
                ),
                width: target.width,
                height: target.height,
              })
              .raw()
              .toBuffer();
          },
        ],
        [
          'resize to 720 for a preview',
          () =>
            sharp(photo)
              .autoOrient()
              .resize({ width: 720, height: 720, fit: 'inside' })
              .raw()
              .toBuffer(),
        ],
      ] as const) {
        await make(); // warm the file cache
        // The median of three: these are tens of milliseconds.
        const times: number[] = [];
        for (let run = 0; run < 3; run++) times.push((await timed(make)).ms);
        const ms = times.sort((a, b) => a - b)[1]!;
        rows.push({
          group: 'decode',
          source: `${name} (${long} px)`,
          variant,
          ms,
        });
      }
    }
  }, 1_800_000);

  it('encodes photos at every level in every setting worth weighing', async () => {
    for (const photo of sources.photos) {
      const name = basename(photo);
      const oriented = sharp(photo).autoOrient();
      const { width, height } = await oriented.metadata();
      const pixels = Buffer.from(
        await sharp(photo).autoOrient().raw().toBuffer(),
      );
      const raw = {
        raw: { width: width!, height: height!, channels: 3 as const },
      };
      const encodes: Array<{
        variant: string;
        make: (quality: number) => Promise<Buffer>;
        avif?: boolean;
      }> = [
        {
          variant: 'avif 4:4:4 effort 4 (now)',
          avif: true,
          make: (q) =>
            sharp(pixels, raw).avif({ quality: q, effort: 4 }).toBuffer(),
        },
        {
          variant: 'avif 4:2:0 effort 4',
          avif: true,
          make: (q) =>
            sharp(pixels, raw)
              .avif({ quality: q, effort: 4, chromaSubsampling: '4:2:0' })
              .toBuffer(),
        },
        {
          variant: 'avif 4:4:4 effort 3',
          avif: true,
          make: (q) =>
            sharp(pixels, raw).avif({ quality: q, effort: 3 }).toBuffer(),
        },
        {
          variant: 'avif 4:2:0 effort 3',
          avif: true,
          make: (q) =>
            sharp(pixels, raw)
              .avif({ quality: q, effort: 3, chromaSubsampling: '4:2:0' })
              .toBuffer(),
        },
        {
          variant: 'avif 4:2:0 effort 2',
          avif: true,
          make: (q) =>
            sharp(pixels, raw)
              .avif({ quality: q, effort: 2, chromaSubsampling: '4:2:0' })
              .toBuffer(),
        },
        {
          variant: 'webp effort 6 smart (now)',
          make: (q) =>
            sharp(pixels, raw)
              .webp({ quality: q, effort: 6, smartSubsample: true })
              .toBuffer(),
        },
        {
          variant: 'webp effort 4 smart',
          make: (q) =>
            sharp(pixels, raw)
              .webp({ quality: q, effort: 4, smartSubsample: true })
              .toBuffer(),
        },
        {
          variant: 'webp effort 4 plain',
          make: (q) =>
            sharp(pixels, raw).webp({ quality: q, effort: 4 }).toBuffer(),
        },
      ];
      for (const level of levels()) {
        const quality = ASSET_QUALITY_LEVEL_QUALITY[level];
        for (const encode of encodes) {
          const q = encode.avif ? AVIF_QUALITY_BY_LEVEL[level] : quality;
          const { ms, value } = await timed(() => encode.make(q));
          const metrics = await compareImages(photo, value, {
            scratch: join(root, 'scratch'),
          });
          rows.push({
            group: 'encode',
            source: `${name} (${width}×${height})`,
            variant: `${level} · ${encode.variant}`,
            ms,
            bytes: value.length,
            ...metrics,
          });
        }
      }
      if (!quick) {
        for (const effort of [6, 4]) {
          const { ms, value } = await timed(() =>
            sharp(pixels, raw).webp({ lossless: true, effort }).toBuffer(),
          );
          rows.push({
            group: 'encode',
            source: `${name} (${width}×${height})`,
            variant: `lossless · webp effort ${effort}${effort === 6 ? ' (now)' : ''}`,
            ms,
            bytes: value.length,
          });
        }
      }
      for (const effort of [4, 3, 2]) {
        const { ms, value } = await timed(() =>
          sharp(photo)
            .autoOrient()
            .resize({
              width: 720,
              height: 720,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .avif({ quality: 40, effort })
            .toBuffer(),
        );
        const metrics = await compareImages(photo, value, {
          side: 720,
          scratch: join(root, 'scratch'),
        });
        rows.push({
          group: 'preview',
          source: name,
          variant: `720 px avif q40 effort ${effort}${effort === 4 ? ' (now)' : ''}`,
          ms,
          bytes: value.length,
          ...metrics,
        });
      }
    }
  }, 3_600_000);

  it('encodes video with each preset worth weighing', async () => {
    for (const clip of sources.clips) {
      const name = basename(clip);
      const inspected = await probeMedia(clip);
      const duration = Math.min(inspected.duration ?? clipSeconds, clipSeconds);
      const settings: AssetVideoTransformSettings = {
        type: 'video-transform',
        quality: ASSET_QUALITY_LEVEL_QUALITY.medium,
        stripAudio: !inspected.hasAudio,
        dimensions: {
          width: inspected.width! > 1920 ? 1920 : inspected.width!,
          height:
            inspected.width! > 1920
              ? Math.round((1920 * inspected.height!) / inspected.width! / 2) *
                2
              : inspected.height!,
        },
      };
      const source = {
        width: inspected.width!,
        height: inspected.height!,
        hasAudio: inspected.hasAudio,
        ...videoSourceInfo(inspected, (await stat(clip)).size),
        ...videoColor(inspected),
      };
      const target = videoTargetBitrate(
        settings.quality,
        settings.dimensions,
        source,
      );
      const expectedBytes =
        ((target * 0.96 + (inspected.hasAudio ? 128_000 : 0)) * duration) / 8;

      const twoPass = buildVideoEncodePasses(
        settings,
        source,
        join(root, 'passlog'),
      );
      const second = (cpuUsed: number) =>
        twoPass.second.map((option) =>
          option.startsWith('-cpu-used') ? `-cpu-used ${cpuUsed}` : option,
        );
      const singleGood = (cpuUsed: number) =>
        twoPass.second
          .filter(
            (option) =>
              !option.startsWith('-pass') && !option.startsWith('-passlogfile'),
          )
          .map((option) =>
            option.startsWith('-cpu-used') ? `-cpu-used ${cpuUsed}` : option,
          );
      const presets: Array<{
        variant: string;
        first?: string[];
        second: string[];
      }> = [
        {
          variant: 'two passes, cpu-used 4 then 4 (now)',
          first: twoPass.first,
          second: twoPass.second,
        },
        {
          variant: 'two passes, cpu-used 4 then 2 (0.0.7)',
          first: twoPass.first,
          second: second(2),
        },
        { variant: 'one pass good, cpu-used 3', second: singleGood(3) },
        { variant: 'one pass good, cpu-used 4', second: singleGood(4) },
        { variant: 'one pass good, cpu-used 5', second: singleGood(5) },
        {
          variant:
            'one pass realtime, cpu-used 8 (the fast conversion of 0.0.7)',
          second: singleGood(8).map((option) =>
            option === '-deadline good' ? '-deadline realtime' : option,
          ),
        },
        {
          variant: 'one pass good, cpu-used 4, one tile column',
          second: singleGood(4).map((option) =>
            option === '-tile-columns 2' ? '-tile-columns 1' : option,
          ),
        },
        ...(quick
          ? []
          : [
              {
                variant: 'SVT-AV1 preset 8 (for reference; not for storing)',
                second: singleGood(4)
                  .filter(
                    (option) =>
                      !/^-(cpu-used|deadline|row-mt|tile-columns|c:v)/.test(
                        option,
                      ),
                  )
                  .concat(['-c:v libsvtav1', '-preset 8']),
              },
            ]),
      ];
      for (const preset of presets) {
        const out = join(root, `out-${rows.length}.webm`);
        const input = ['-y', '-t', String(duration), '-i', clip];
        try {
          const { ms } = await timed(async () => {
            if (preset.first) {
              await runFfmpeg([
                ...input,
                ...splitFfmpegOptions(preset.first),
                '-',
              ]);
            }
            await runFfmpeg([
              ...input,
              ...splitFfmpegOptions(preset.second),
              out,
            ]);
          });
          const bytes = (await stat(out)).size;
          const metrics = await compareVideos(clip, out, { vmaf: true }).catch(
            () => ({}) as { ssim?: number; psnr?: number; vmaf?: number },
          );
          rows.push({
            group: 'video',
            source: `${name} (${inspected.width}×${inspected.height}, ${duration} s → ${settings.dimensions.width}×${settings.dimensions.height})`,
            variant: preset.variant,
            ms,
            bytes,
            speed: Math.round((duration / (ms / 1000)) * 100) / 100,
            ofTarget: Math.round((bytes / expectedBytes) * 100) / 100,
            ...metrics,
          });
        } catch (error) {
          rows.push({
            group: 'video',
            source: name,
            variant: preset.variant,
            ms: 0,
            note: (error as Error).message.trim().split('\n').pop() ?? 'failed',
          });
        } finally {
          await rm(out, { force: true });
        }
      }
    }
  }, 3_600_000);

  it('encodes sound and reads it back for the waveform', async () => {
    for (const recording of sources.recordings) {
      const name = basename(recording);
      const inspected = await probeMedia(recording);
      const duration = inspected.duration ?? 0;
      for (const [variant, bitrate] of [
        ['opus 96k stereo (medium)', '96k'],
        ['opus 48k mono (medium)', '48k'],
      ] as const) {
        const out = join(root, `out-${rows.length}.weba`);
        const { ms } = await timed(() =>
          runFfmpeg([
            '-y',
            '-i',
            recording,
            '-map',
            '0:a:0',
            '-vn',
            '-c:a',
            'libopus',
            '-b:a',
            bitrate,
            '-vbr',
            'on',
            '-ar',
            '48000',
            '-ac',
            variant.includes('mono') ? '1' : '2',
            '-f',
            'webm',
            out,
          ]),
        );
        rows.push({
          group: 'sound',
          source: `${name} (${Math.round(duration)} s)`,
          variant,
          ms,
          bytes: (await stat(out)).size,
          speed: Math.round((duration / (ms / 1000)) * 10) / 10,
        });
        await rm(out, { force: true });
      }
      const { ms } = await timed(() => readAudioDetails(recording));
      rows.push({
        group: 'sound',
        source: `${name} (${Math.round(duration)} s)`,
        variant: 'decode for the waveform',
        ms,
        speed: Math.round((duration / (ms / 1000)) * 10) / 10,
      });
    }
  }, 1_800_000);
});

async function environment() {
  const ffmpeg = await toolVersion(resolveFfmpegTools().ffmpeg).catch(
    () => resolveFfmpegTools().ffmpeg,
  );
  return {
    date: new Date().toISOString(),
    label,
    platform: `${process.platform}-${process.arch}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 1e8) / 10,
    runtime: `Node ${process.version}`,
    sharp: sharp.versions.sharp,
    libvips: sharp.versions.vips,
    aom: sharp.versions.aom,
    webp: sharp.versions.webp,
    heif: sharp.versions.heif,
    ffmpeg,
    quick,
    clipSeconds,
    sources: process.env.THEI_MEDIA_BENCH_SOURCES ?? 'synthetic',
  };
}

async function writeReport() {
  const env = await environment();
  const suffix = label ? `-${label}` : '';
  await writeFile(
    join(output, `report${suffix}.json`),
    JSON.stringify({ environment: env, rows }, null, 2),
  );
  const fmt = (value: number | undefined, digits = 0) =>
    value === undefined ? '' : value.toFixed(digits);
  const kb = (bytes: number | undefined) =>
    bytes === undefined
      ? ''
      : `${Math.round(bytes / 1024).toLocaleString('en')} KB`;
  const lines = [
    `# Media bench${label ? ` — ${label}` : ''}`,
    '',
    `${env.date} · ${env.platform} · ${env.cpu} × ${env.cores} · ${env.memoryGb} GB`,
    '',
    `sharp ${env.sharp} (libvips ${env.libvips}, aom ${env.aom}, webp ${env.webp}, heif ${env.heif}) · ${env.ffmpeg} · ${env.runtime}`,
    '',
    `Sources: ${env.sources}${env.quick ? ' · quick' : ''} · video ${env.clipSeconds} s`,
    '',
  ];
  const groups = [...new Set(rows.map((row) => row.group))];
  for (const group of groups) {
    const ofGroup = rows.filter((row) => row.group === group);
    lines.push(`## ${group}`, '');
    if (group === 'video') {
      lines.push(
        '| Source | Preset | Time | × realtime | Size | Of target | VMAF | SSIM | PSNR | Note |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
      );
      for (const row of ofGroup) {
        lines.push(
          `| ${row.source} | ${row.variant} | ${row.ms ? `${(row.ms / 1000).toFixed(1)} s` : ''} | ${fmt(row.speed, 2)} | ${kb(row.bytes)} | ${fmt(row.ofTarget, 2)} | ${fmt(row.vmaf, 1)} | ${fmt(row.ssim, 4)} | ${fmt(row.psnr, 1)} | ${row.note ?? ''} |`,
        );
      }
    } else if (group === 'sound') {
      lines.push(
        '| Source | Variant | Time | × realtime | Size |',
        '| --- | --- | ---: | ---: | ---: |',
      );
      for (const row of ofGroup) {
        lines.push(
          `| ${row.source} | ${row.variant} | ${row.ms} ms | ${fmt(row.speed, 1)} | ${kb(row.bytes)} |`,
        );
      }
    } else {
      lines.push(
        '| Source | Variant | Time | Size | SSIM | PSNR |',
        '| --- | --- | ---: | ---: | ---: | ---: |',
      );
      for (const row of ofGroup) {
        lines.push(
          `| ${row.source} | ${row.variant} | ${row.ms} ms | ${kb(row.bytes)} | ${fmt(row.ssim, 4)} | ${fmt(row.psnr, 1)} |`,
        );
      }
    }
    lines.push('');
  }
  await writeFile(join(output, `report${suffix}.md`), `${lines.join('\n')}\n`);
  console.log(`\nMedia bench report: ${join(output, `report${suffix}.md`)}\n`);
}
