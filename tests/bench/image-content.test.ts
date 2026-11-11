import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import { describe, it } from 'vitest';
import {
  blockColourHistogram,
  imageContentStats,
  readImageLuma,
} from '../../server/thei/assets/image-content';
import { processMediaTransformAsset } from '../../server/thei/assets/process';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  ASSET_QUALITY_LEVELS,
  type AssetQualityLevel,
} from '../../shared/asset-quality-levels';
import {
  ASSET_TRANSFORM_MAX_DIMENSION,
  type AssetImageFormat,
} from '../../shared/asset-upload-settings';
import {
  corpusDirectory,
  readCorpusManifest,
  type CorpusFile,
} from './image-corpus/fetch';

/**
 * What tells a photograph from a drawing, weighed on real pictures: `bun run
 * bench:corpus` brings them, `bun run bench:image-content` measures them, and
 * `tests/.artifacts/image-content-bench/report.md` is what to read.
 *
 * For every picture of the corpus: the block counts "Auto" would decide by
 * (`server/thei/assets/image-content.ts`), how long counting takes, and what
 * the picture really weighs as AVIF, WebP and lossless WebP at every quality
 * level, made by the pipeline itself at the picture's own size. The report
 * then says where calling a picture a photograph — AVIF at once, nothing else
 * encoded — would have cost bytes, and what each threshold costs and saves.
 *
 * Not a test of anything: it runs only when asked for. Encodes are kept in
 * `results.json` by the file's hash, so a second run only counts blocks again.
 *
 *   THEI_IMAGE_CONTENT_BENCH=1   runs it
 */
const enabled = Boolean(process.env.THEI_IMAGE_CONTENT_BENCH);
const output = join(
  import.meta.dirname,
  '..',
  '.artifacts',
  'image-content-bench',
);

type LossyFormat = 'avif' | 'webp';

interface Encodes {
  width: number;
  height: number;
  lossless: number;
  losslessMs: number;
  lossy: Record<AssetQualityLevel, Record<LossyFormat, number>>;
  lossyMs: Record<LossyFormat, number>;
}

interface Measured {
  flat: number;
  few: number;
  /** The same counts with every pixel read, for what sampling changes. */
  wholeFlat: number;
  wholeFew: number;
  /** Share of blocks of at most this many values, for weighing other rules. */
  upTo: Record<string, number>;
  ms: number;
}

interface Row extends Measured {
  entry: CorpusFile;
  encodes: Encodes;
}

async function timed<T>(fn: () => Promise<T>) {
  const started = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - started), value };
}

async function encode(path: string): Promise<Encodes> {
  const { width, height } = (await sharp(path).metadata()).autoOrient;
  const scale = Math.min(
    1,
    ASSET_TRANSFORM_MAX_DIMENSION / Math.max(width, height),
  );
  const dimensions = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  const source = {
    path,
    size: (await stat(path)).size,
    hash: '',
    extension: extname(path).slice(1),
    owned: false,
  };
  const make = async (format: AssetImageFormat, quality: number) => {
    const { ms, value } = await timed(() =>
      processMediaTransformAsset(source, {
        type: 'image-transform',
        quality,
        format,
        dimensions,
      }),
    );
    return { ms, bytes: value.bytes.buffer!.length };
  };

  const lossless = await make('webp-lossless', 100);
  const lossy = {} as Encodes['lossy'];
  const lossyMs = { avif: 0, webp: 0 };
  for (const level of ASSET_QUALITY_LEVELS) {
    const quality = ASSET_QUALITY_LEVEL_QUALITY[level];
    const avif = await make('avif', quality);
    const webp = await make('webp', quality);
    lossy[level] = { avif: avif.bytes, webp: webp.bytes };
    lossyMs.avif += avif.ms;
    lossyMs.webp += webp.ms;
  }
  return {
    ...dimensions,
    lossless: lossless.bytes,
    losslessMs: lossless.ms,
    lossy,
    lossyMs,
  };
}

async function measure(path: string): Promise<Measured> {
  let upTo: Record<string, number> = {};
  const count = async (maxPixels?: number) => {
    const { data, width, height } = await readImageLuma(path, maxPixels);
    const histogram = blockColourHistogram(data, width, height);
    const stats = imageContentStats(histogram);
    if (maxPixels === undefined) {
      let sum = 0;
      upTo = {};
      for (let colours = 1; colours <= 64; colours += 1) {
        sum += histogram[colours]!;
        if ([1, 2, 4, 8, 16, 32, 64].includes(colours)) {
          upTo[colours] = stats.blocks ? sum / stats.blocks : 0;
        }
      }
    }
    return stats;
  };
  await count(); // warm the file cache
  const times: number[] = [];
  let sampled = await count();
  for (let run = 0; run < 3; run += 1) {
    const { ms, value } = await timed(() => count());
    times.push(ms);
    sampled = value;
  }
  const whole = await count(Infinity);
  return {
    flat: sampled.flat,
    few: sampled.few,
    wholeFlat: whole.flat,
    wholeFew: whole.few,
    upTo,
    ms: times.sort((a, b) => a - b)[1]!,
  };
}

/** The smallest of the three at a level, and how much larger AVIF is. */
function atLevel(encodes: Encodes, level: AssetQualityLevel) {
  const { avif, webp } = encodes.lossy[level];
  const best = Math.min(avif, webp, encodes.lossless);
  return {
    winner:
      best === avif ? 'A' : best === encodes.lossless ? 'L' : ('W' as string),
    avifOver: avif / best - 1,
  };
}

const percent = (share: number) =>
  share >= 0.1
    ? `${Math.round(share * 100)}%`
    : `${(share * 100).toFixed(share < 0.001 ? 2 : 1)}%`;
const kb = (bytes: number) =>
  bytes >= 10 * 1024 * 1024
    ? `${Math.round(bytes / 1024 / 1024)} MB`
    : `${Math.round(bytes / 1024)} KB`;

function report(rows: Row[]): string {
  const lines = [
    '# Image content bench',
    '',
    `${rows.length} pictures. Blocks are 16×16 of brightness: **flat** holds one value, **few** two to four.`,
    'Winners are per quality level, minimal → maximum: **A** AVIF, **W** WebP, **L** lossless WebP.',
    '**AVIF over** is how much larger AVIF is than the smallest of the three, at the level where that is worst.',
    '',
  ];
  const kinds = [...new Set(rows.map((row) => row.entry.kind))];
  for (const kind of kinds) {
    lines.push(
      `## ${kind}`,
      '',
      '| Picture | Size | Flat | Few | Flat+few | Whole flat+few | Count, ms | AVIF med. | WebP med. | Lossless | Winners | AVIF over |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const row of rows
      .filter((item) => item.entry.kind === kind)
      .sort((a, b) => a.flat + a.few - (b.flat + b.few))) {
      const levels = ASSET_QUALITY_LEVELS.map((level) =>
        atLevel(row.encodes, level),
      );
      lines.push(
        `| ${[
          row.entry.file.split('/')[1],
          `${row.encodes.width}×${row.encodes.height}`,
          percent(row.flat),
          percent(row.few),
          percent(row.flat + row.few),
          percent(row.wholeFlat + row.wholeFew),
          row.ms,
          kb(row.encodes.lossy.medium.avif),
          kb(row.encodes.lossy.medium.webp),
          kb(row.encodes.lossless),
          levels.map((level) => level.winner).join(' '),
          percent(Math.max(...levels.map((level) => level.avifOver))),
        ].join(' | ')} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    '## Thresholds',
    '',
    'A picture is called a photograph when it has at least 64 blocks and its flat and few blocks together stay under the threshold: it is then stored as AVIF, and neither WebP is encoded for it.',
    '**Costly** are pictures so called where AVIF is not the smallest of the three at some level, with how much larger it is where that is worst; **drawn** are logos and flat graphics so called.',
    '**Time saved** is the WebP and lossless encodes of the pictures so called, of one encode in each format at a level for the whole corpus.',
    '',
    '| Flat+few under | Called photographs | Of photos | Of 3D games | Costly | Drawn | Time saved |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  /** How much AVIF is over the smallest of the three, where that is worst. */
  const worst = (row: Row) =>
    Math.max(
      ...ASSET_QUALITY_LEVELS.map(
        (level) => atLevel(row.encodes, level).avifOver,
      ),
    );
  const levels = ASSET_QUALITY_LEVELS.length;
  const of = (kind: string, called: Row[]) => {
    const all = rows.filter((row) => row.entry.kind === kind).length;
    const hit = called.filter((row) => row.entry.kind === kind).length;
    return `${hit}/${all}`;
  };
  for (const threshold of [
    0.001, 0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3,
  ]) {
    const called = rows.filter(
      (row) =>
        row.flat + row.few < threshold &&
        Math.floor(row.encodes.width / 16) *
          Math.floor(row.encodes.height / 16) >=
          64,
    );
    const costly = called.filter((row) => worst(row) > 0);
    const drawn = called.filter(
      (row) => row.entry.kind === 'logo' || row.entry.kind === 'flat',
    );
    const saved = called.reduce(
      (sum, row) =>
        sum + row.encodes.losslessMs + row.encodes.lossyMs.webp / levels,
      0,
    );
    const total = rows.reduce(
      (sum, row) =>
        sum +
        row.encodes.losslessMs +
        (row.encodes.lossyMs.webp + row.encodes.lossyMs.avif) / levels,
      0,
    );
    lines.push(
      `| ${[
        percent(threshold),
        `${called.length}/${rows.length}`,
        of('photo', called),
        of('game3d', called),
        costly.length
          ? costly
              .map(
                (row) =>
                  `${row.entry.file.split('/')[1]} (+${percent(worst(row))})`,
              )
              .join(', ')
          : '—',
        drawn.length
          ? drawn.map((row) => row.entry.file.split('/')[1]).join(', ')
          : '—',
        percent(saved / total),
      ].join(' | ')} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

describe.runIf(enabled)('image content bench', () => {
  it('measures the corpus', async () => {
    await mkdir(output, { recursive: true });
    const resultsPath = join(output, 'results.json');
    const kept = JSON.parse(
      await readFile(resultsPath, 'utf8').catch(() => '{}'),
    ) as Record<string, Encodes>;

    const rows: Row[] = [];
    for (const entry of await readCorpusManifest()) {
      const path = join(corpusDirectory, entry.file);
      const bytes = await readFile(path).catch(() => undefined);
      if (!bytes) {
        console.warn(`Not in the corpus, run bench:corpus: ${entry.file}`);
        continue;
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (!kept[hash]) {
        kept[hash] = await encode(path);
        await writeFile(resultsPath, JSON.stringify(kept, null, 2));
      }
      rows.push({ entry, encodes: kept[hash], ...(await measure(path)) });
    }
    await writeFile(join(output, 'report.md'), report(rows));
    await writeFile(
      join(output, 'rows.json'),
      JSON.stringify(
        rows.map(({ entry, encodes, ...measured }) => ({
          file: entry.file,
          kind: entry.kind,
          ...measured,
          encodes,
        })),
        null,
        2,
      ),
    );
  }, 7_200_000);
});
