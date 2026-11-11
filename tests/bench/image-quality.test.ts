import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, it } from 'vitest';
import {
  avifEncodeOptions,
  webpEncodeOptions,
  webpLosslessEncodeOptions,
} from '../../server/thei/assets/process';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  ASSET_QUALITY_LEVELS,
  type AssetQualityLevel,
} from '../../shared/asset-quality-levels';
import {
  imageDisplayQualityToAvifQuality,
  imageDisplayQualityToWebpQuality,
} from '../../shared/asset-upload-quality';
import { runFfmpeg } from '../helpers/media';
import {
  corpusDirectory,
  readCorpusManifest,
  type CorpusFile,
} from './image-corpus/fetch';

/**
 * Whether a quality level means the same in AVIF and in WebP, weighed on real
 * pictures: `bun run bench:corpus` brings them, `bun run bench:image-quality`
 * sweeps both encoders over them, and
 * `tests/.artifacts/image-quality-bench/report.md` is what to read.
 *
 * Every picture is encoded at every fifth quality of each encoder, with the
 * pipeline's own settings (`processImage` in `server/thei/assets/process.ts`),
 * and each result is put against its source. From the curves the report reads
 * what the levels are today in each format, which AVIF quality looks like
 * each WebP one, and what each format weighs at the same closeness to the
 * source — the only fair way to call one smaller.
 *
 * Closeness is measured four ways, none of them an eye: SSIM and PSNR of the
 * brightness alone, XPSNR (PSNR weighted by what an eye notices) and VMAF.
 * Brightness, because the two formats keep colour differently — AVIF whole,
 * lossy WebP at half the resolution — and an eye sees that far less than a
 * count over red, green and blue does; that count is kept beside the rest
 * (`ssimRgb`) to show how much it flatters AVIF.
 *
 * A large picture is measured on its middle, cut out at its own scale, since
 * resizing changes what an encoder is given; a few are also measured whole.
 * Sweeps are kept in `results.json` by the file's hash.
 *
 *   THEI_IMAGE_QUALITY_BENCH=1   runs it
 */
const enabled = Boolean(process.env.THEI_IMAGE_QUALITY_BENCH);
const output = join(
  import.meta.dirname,
  '..',
  '.artifacts',
  'image-quality-bench',
);

const AVIF_QUALITIES = [
  20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
];
const WEBP_QUALITIES = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
const PER_KIND = 7;
const WHOLE_PHOTOS = 6;
const WHOLE_MAX_PIXELS = 14_000_000;
const CROP = { width: 1600, height: 1200 };
/** Bumped when what a sweep measures changes: kept sweeps are then redone. */
const SWEEP_VERSION = 2;

type Format = 'avif' | 'webp';
const METRICS = ['ssim', 'psnr', 'xpsnr', 'vmaf', 'ssimRgb'] as const;
type Metric = (typeof METRICS)[number];
const METRIC_NAME: Record<Metric, string> = {
  ssim: 'SSIM of brightness',
  psnr: 'PSNR of brightness',
  xpsnr: 'XPSNR',
  vmaf: 'VMAF',
  ssimRgb: 'SSIM over red, green and blue',
};

interface Point extends Record<Metric, number | undefined> {
  quality: number;
  bytes: number;
}

interface Sweep {
  width: number;
  height: number;
  lossless: number;
  avif: Point[];
  webp: Point[];
}

interface Row extends Sweep {
  file: string;
  kind: CorpusFile['kind'];
  scope: 'middle' | 'whole';
}

/** The picture, or its middle, as the pixels an encoder is given. */
async function source(path: string, whole: boolean) {
  const { width, height } = (await sharp(path).metadata()).autoOrient;
  let pipeline = sharp(path, { animated: false })
    .autoOrient()
    .flatten({ background: '#ffffff' });
  // Even sides always: the perceptual measures work on whole pairs of pixels.
  const even = (side: number) => Math.max(2, side - (side % 2));
  const cropWidth = even(whole ? width : Math.min(width, CROP.width));
  const cropHeight = even(whole ? height : Math.min(height, CROP.height));
  if (cropWidth !== width || cropHeight !== height) {
    pipeline = pipeline.extract({
      left: Math.floor((width - cropWidth) / 2),
      top: Math.floor((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    });
  }
  const { data, info } = await pipeline
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { raw: data, width: info.width, height: info.height };
}

/** How close an encoded picture is to the pixels it was made from. */
async function closenessOf(
  referencePath: string,
  encoded: Buffer,
  size: { width: number; height: number },
  scratch: string,
): Promise<Record<Metric, number | undefined>> {
  const candidatePath = join(scratch, `candidate-${process.hrtime.bigint()}`);
  await writeFile(
    candidatePath,
    await sharp(encoded).removeAlpha().raw().toBuffer(),
  );
  const input = (file: string) => [
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-s',
    `${size.width}x${size.height}`,
    '-i',
    file,
  ];
  const outputs = ['o1', 'o2', 'o3', 'o4', 'o5'];
  try {
    const log = await runFfmpeg([
      ...input(referencePath),
      ...input(candidatePath),
      '-lavfi',
      '[0:v]split=2[ar][a0];[1:v]split=2[br][b0];[br][ar]ssim[o1];' +
        '[a0]format=yuv444p,split=4[a1][a2][a3][a4];' +
        '[b0]format=yuv444p,split=4[b1][b2][b3][b4];' +
        '[b1][a1]ssim[o2];[b2][a2]psnr[o3];[b3][a3]xpsnr[o4];' +
        '[b4][a4]libvmaf=n_threads=8[o5]',
      ...outputs.flatMap((name) => ['-map', `[${name}]`, '-f', 'null', '-']),
    ]);
    const read = (pattern: RegExp) => {
      const found = pattern.exec(log)?.[1];
      if (found === undefined) return undefined;
      return found === 'inf' ? 100 : Number(found);
    };
    return {
      ssimRgb: read(/SSIM R:.*?All:([\d.]+)/),
      ssim: read(/SSIM Y:([\d.]+)/),
      psnr: read(/PSNR y:([\d.]+|inf)/),
      xpsnr: read(/XPSNR\s+y:\s*([\d.]+|inf)/),
      vmaf: read(/VMAF score:\s*([\d.]+)/),
    };
  } finally {
    await rm(candidatePath, { force: true });
  }
}

async function sweep(path: string, whole: boolean, scratch: string) {
  const { raw, width, height } = await source(path, whole);
  const size = { width, height };
  const referencePath = join(scratch, `reference-${process.hrtime.bigint()}`);
  await writeFile(referencePath, raw);
  const pixels = () => sharp(raw, { raw: { ...size, channels: 3 } });
  const points = async (
    qualities: number[],
    encode: (quality: number) => Promise<Buffer>,
  ): Promise<Point[]> => {
    const out: Point[] = [];
    for (const quality of qualities) {
      const bytes = await encode(quality);
      out.push({
        quality,
        bytes: bytes.length,
        ...(await closenessOf(referencePath, bytes, size, scratch)),
      });
    }
    return out;
  };
  try {
    return {
      ...size,
      lossless: (await pixels().webp(webpLosslessEncodeOptions()).toBuffer())
        .length,
      avif: await points(AVIF_QUALITIES, (quality) =>
        pixels().avif(avifEncodeOptions(quality)).toBuffer(),
      ),
      webp: await points(WEBP_QUALITIES, (quality) =>
        pixels().webp(webpEncodeOptions(quality)).toBuffer(),
      ),
    } satisfies Sweep;
  } finally {
    await rm(referencePath, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Reading the curves.

/** SSIM as decibels of what is lost: evenly spaced where 0.99 and 0.999 are not. */
const ssimDb = (ssim: number) => -10 * Math.log10(Math.max(1e-6, 1 - ssim));
/** A metric on a scale it rises evenly on; nothing where it was not measured. */
function closeness(point: Point, metric: Metric): number | undefined {
  const value = point[metric];
  if (value === undefined) return undefined;
  return metric === 'ssim' || metric === 'ssimRgb' ? ssimDb(value) : value;
}

/**
 * The curve at a quality: a measured point, or, for a quality between two
 * of them, read between its neighbours.
 */
function at(points: Point[], quality: number): Point {
  const measured = points.find((point) => point.quality === quality);
  if (measured) return measured;
  const high = points.find((point) => point.quality > quality)!;
  const low = points[points.indexOf(high) - 1]!;
  const share = (quality - low.quality) / (high.quality - low.quality);
  const between = (from: number, to: number) => from + (to - from) * share;
  const point = {
    quality,
    bytes: Math.exp(between(Math.log(low.bytes), Math.log(high.bytes))),
  } as Point;
  for (const metric of METRICS) {
    const from = low[metric];
    const to = high[metric];
    if (from === undefined || to === undefined) continue;
    point[metric] =
      metric === 'ssim' || metric === 'ssimRgb'
        ? 1 - 10 ** (-between(ssimDb(from), ssimDb(to)) / 10)
        : between(from, to);
  }
  return point;
}

/**
 * Where on a curve a closeness to the source is reached: the quality, and the
 * bytes there, read between the two measured points around it. Nothing when
 * the curve never gets there, or is there from its first point.
 */
function reach(
  points: Point[],
  target: number | undefined,
  metric: Metric,
): { quality: number; bytes: number } | undefined {
  if (target === undefined) return undefined;
  for (let index = 1; index < points.length; index += 1) {
    const low = points[index - 1]!;
    const high = points[index]!;
    const from = closeness(low, metric);
    const to = closeness(high, metric);
    if (from === undefined || to === undefined) continue;
    if (from <= target && to >= target && to > from) {
      const share = (target - from) / (to - from);
      return {
        quality: low.quality + (high.quality - low.quality) * share,
        bytes: Math.exp(
          Math.log(low.bytes) +
            (Math.log(high.bytes) - Math.log(low.bytes)) * share,
        ),
      };
    }
  }
  return undefined;
}

function median(values: (number | undefined)[]): number | undefined {
  const sorted = values
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const fixed = (value: number | undefined, digits = 2) =>
  value === undefined ? '—' : value.toFixed(digits);
const kb = (bytes: number | undefined) =>
  bytes === undefined ? '—' : `${Math.round(bytes / 1024)}`;
/** What each encoder is asked for at a level, as the pipeline asks it. */
const levelQuality = (format: Format, level: AssetQualityLevel) =>
  (format === 'avif'
    ? imageDisplayQualityToAvifQuality
    : imageDisplayQualityToWebpQuality)(ASSET_QUALITY_LEVEL_QUALITY[level]);

function report(rows: Row[]): string {
  const middles = rows.filter((row) => row.scope === 'middle');
  const of = (...kinds: CorpusFile['kind'][]) =>
    middles.filter((row) => kinds.includes(row.kind));
  const groups: [string, Row[]][] = [
    ['all', middles],
    ['photo', of('photo')],
    ['game', of('game3d', 'game2d')],
    ['drawn', of('logo', 'flat')],
    ['mixed', of('mixed')],
    ['photo, whole', rows.filter((row) => row.scope === 'whole')],
  ];
  const lines = [
    '# Image quality bench',
    '',
    `${middles.length} pictures measured on their middle (at most ${CROP.width}×${CROP.height}, at their own scale), ${rows.length - middles.length} photographs whole.`,
    `AVIF: effort ${avifEncodeOptions(0).effort}, 4:4:4, libaom ${sharp.versions.aom}. WebP: effort ${webpEncodeOptions(0).effort}, smart subsampling, libwebp ${sharp.versions.webp}. Every number is a median over the pictures of its row.`,
    'SSIM, PSNR and XPSNR are of the brightness; SSIM is also given in decibels of what is lost (20 dB is 0.99).',
    '',
    '## The levels as they are',
    '',
    'What a level weighs and how close to the source it stays, in each format.',
    '',
    '| Pictures | Level | AVIF q | KB | SSIM | PSNR | XPSNR | VMAF | WebP q | KB | SSIM | PSNR | XPSNR | VMAF | AVIF/WebP bytes | WebP smaller |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const cells = (points: Point[]) => [
    kb(median(points.map((point) => point.bytes))),
    `${fixed(median(points.map((point) => point.ssim)), 4)} (${fixed(median(points.map((point) => closeness(point, 'ssim'))), 1)})`,
    fixed(median(points.map((point) => point.psnr)), 1),
    fixed(median(points.map((point) => point.xpsnr)), 1),
    fixed(median(points.map((point) => point.vmaf)), 1),
  ];
  for (const [name, group] of groups) {
    for (const level of ASSET_QUALITY_LEVELS) {
      const avif = group.map((row) =>
        at(row.avif, levelQuality('avif', level)),
      );
      const webp = group.map((row) =>
        at(row.webp, levelQuality('webp', level)),
      );
      lines.push(
        `| ${[
          name,
          level,
          levelQuality('avif', level),
          ...cells(avif),
          levelQuality('webp', level),
          ...cells(webp),
          fixed(
            median(
              avif.map((point, index) => point.bytes / webp[index]!.bytes),
            ),
          ),
          `${avif.filter((point, index) => webp[index]!.bytes < point.bytes).length}/${group.length}`,
        ].join(' | ')} |`,
      );
    }
  }

  lines.push(
    '',
    '## The WebP quality as close to the source as AVIF is at each level',
    '',
    'By each measure: the WebP quality that reaches what AVIF reaches at a level, and what WebP weighs there against that AVIF. In brackets, how many of the pictures have a WebP curve that gets there between q30 and q95.',
    '',
    `| Pictures | Level | AVIF q | ${METRICS.map((metric) => `${METRIC_NAME[metric]}: WebP q, bytes ×`).join(' | ')} |`,
    `| --- | --- | --- | ${METRICS.map(() => '---').join(' | ')} |`,
  );
  for (const [name, group] of groups) {
    for (const level of ASSET_QUALITY_LEVELS) {
      const quality = levelQuality('avif', level);
      lines.push(
        `| ${[
          name,
          level,
          quality,
          ...METRICS.map((metric) => {
            const matches = group.flatMap((row) => {
              const avif = at(row.avif, quality);
              const match = reach(row.webp, closeness(avif, metric), metric);
              return match ? [{ avif, match }] : [];
            });
            return `${fixed(median(matches.map((item) => item.match.quality)), 0)}, ×${fixed(median(matches.map((item) => item.match.bytes / item.avif.bytes)))} (${matches.length}/${group.length})`;
          }),
        ].join(' | ')} |`,
      );
    }
  }

  lines.push(
    '',
    '## Every quality measured',
    '',
    'Medians over the pictures measured on their middle, and over the photographs among them.',
    '',
    '| Format | q | KB | Bytes against the step below | SSIM | PSNR | XPSNR | VMAF | Photographs: KB | SSIM | PSNR | XPSNR | VMAF |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  const photos = of('photo');
  for (const [format, qualities] of [
    ['avif', AVIF_QUALITIES],
    ['webp', WEBP_QUALITIES],
  ] as const) {
    qualities.forEach((quality, index) => {
      const below =
        index > 0
          ? middles.map(
              (row) =>
                at(row[format], quality).bytes /
                at(row[format], qualities[index - 1]!).bytes,
            )
          : [];
      const [bytes, ...rest] = cells(
        middles.map((row) => at(row[format], quality)),
      );
      lines.push(
        `| ${[
          format,
          quality,
          bytes,
          below.length ? `×${fixed(median(below))}` : '—',
          ...rest,
          ...cells(photos.map((row) => at(row[format], quality))),
        ].join(' | ')} |`,
      );
    });
  }
  lines.push('');
  return lines.join('\n');
}

/** A few of each kind, spread over the manifest, and the same on every run. */
function pick(files: CorpusFile[]) {
  const picked: { entry: CorpusFile; scope: Row['scope'] }[] = [];
  for (const kind of [...new Set(files.map((file) => file.kind))]) {
    const of = files.filter((file) => file.kind === kind);
    const step = Math.max(1, of.length / PER_KIND);
    for (let index = 0; index < Math.min(PER_KIND, of.length); index += 1) {
      picked.push({ entry: of[Math.floor(index * step)]!, scope: 'middle' });
    }
  }
  return picked;
}

describe.runIf(enabled)('image quality bench', () => {
  it('sweeps both encoders over the corpus', async () => {
    await mkdir(output, { recursive: true });
    const scratch = await mkdtemp(join(tmpdir(), 'thei-image-quality-'));
    const resultsPath = join(output, 'results.json');
    const kept = JSON.parse(
      await readFile(resultsPath, 'utf8').catch(() => '{}'),
    ) as Record<string, Sweep>;
    try {
      const files = await readCorpusManifest();
      const wanted = pick(files);
      let whole = 0;
      for (const entry of files) {
        if (entry.kind !== 'photo' || whole >= WHOLE_PHOTOS) continue;
        const meta = await sharp(join(corpusDirectory, entry.file))
          .metadata()
          .catch(() => undefined);
        const pixels = (meta?.width ?? 0) * (meta?.height ?? 0);
        if (
          pixels > CROP.width * CROP.height * 2 &&
          pixels <= WHOLE_MAX_PIXELS
        ) {
          wanted.push({ entry, scope: 'whole' });
          whole += 1;
        }
      }

      const rows: Row[] = [];
      for (const { entry, scope } of wanted) {
        const path = join(corpusDirectory, entry.file);
        const bytes = await readFile(path).catch(() => undefined);
        if (!bytes) {
          console.warn(`Not in the corpus, run bench:corpus: ${entry.file}`);
          continue;
        }
        const key = `${createHash('sha256').update(bytes).digest('hex')}:${scope}:${SWEEP_VERSION}`;
        if (!kept[key]) {
          kept[key] = await sweep(path, scope === 'whole', scratch);
          await writeFile(resultsPath, JSON.stringify(kept));
        }
        rows.push({ file: entry.file, kind: entry.kind, scope, ...kept[key] });
      }
      await writeFile(join(output, 'report.md'), report(rows));
      await writeFile(join(output, 'rows.json'), JSON.stringify(rows));
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }, 7_200_000);
});
