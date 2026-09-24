import { defineMigration } from './types';

interface Size {
  width: number;
  height: number;
}

interface Rect extends Size {
  left: number;
  top: number;
}

type Recipe = Record<string, unknown> & {
  type?: unknown;
  dimensions?: { width?: unknown; height?: unknown };
};

const IMAGE_FORMATS = new Set(['avif', 'webp', 'webp-lossless']);

/**
 * Rewrites transform recipes stored before crops existed into the form every
 * new recipe has: a region of the source and an exact size.
 *
 * Those recipes named a fit mode and an upscale flag. The output size is what
 * the file really has. "Fit inside" never cut anything. "Fill" cut the
 * largest centred region of the output's proportions, so the region follows
 * from the size of the original the file was made from, which the family
 * still holds when it kept one. When it did not, the recipe says only what is
 * certain: the file's own size. The settings key is rebuilt the same way,
 * unless a row with that key and those bytes already exists in the family.
 *
 * The file is what it is and is never re-encoded here; only its description
 * changes. Recipes an earlier 0.0.2 build already rewrote with a `legacyFit`
 * note are finished the same way.
 */
export default defineMigration({
  id: '0.0.2/008-asset-recipe-crops',
  version: '0.0.2',
  title: {
    en: 'Describe file recipes by crop',
    ru: 'Перевести рецепты файлов на обрезку',
  },
  description: {
    en: 'Files made with the old "fill" and "fit" settings are described the new way: the part of the original they show and their exact size. The files themselves do not change.',
    ru: 'Файлы, сделанные со старыми настройками «заполнить» и «вписать», описываются по-новому: какая часть исходника в них и какого они точно размера. Сами файлы не меняются.',
  },
  up({ rawDb }) {
    const rows = rawDb
      .prepare(
        `SELECT assetUuid, familyUuid, contentHash, settingsKey, extension,
                type, settings, meta
         FROM assets
         WHERE settings LIKE '%"resizeMode"%' OR settings LIKE '%"legacyFit"%'`,
      )
      .all() as Array<{
      assetUuid: string;
      familyUuid: string;
      contentHash: string;
      settingsKey: string;
      extension: string;
      type: string;
      settings: string | null;
      meta: string | null;
    }>;
    const original = rawDb.prepare(
      `SELECT meta FROM assets
       WHERE familyUuid = ? AND type = ? AND settingsKey = 'original'
       LIMIT 1`,
    );
    const taken = rawDb.prepare(
      `SELECT 1 FROM assets
       WHERE familyUuid = ? AND contentHash = ? AND settingsKey = ?
         AND assetUuid <> ?`,
    );
    const update = rawDb.prepare(
      'UPDATE assets SET settings = ?, settingsKey = ?, meta = ? WHERE assetUuid = ?',
    );

    for (const row of rows) {
      const recipe = parseObject(row.settings) as Recipe | undefined;
      if (
        recipe?.type !== 'image-transform' &&
        recipe?.type !== 'video-transform'
      )
        continue;
      const fit = recipe.resizeMode ?? recipe.legacyFit;
      if (fit === undefined) continue;
      const isVideo = recipe.type === 'video-transform';

      const meta = parseObject(row.meta);
      const output = size(
        positive(meta?.width) ?? positive(recipe.dimensions?.width),
        positive(meta?.height) ?? positive(recipe.dimensions?.height),
      );
      const originalMeta = parseObject(
        (original.get(row.familyUuid, row.type) as { meta: string | null })
          ?.meta ?? null,
      );
      const source = size(
        positive(originalMeta?.width),
        positive(originalMeta?.height),
      );

      const crop =
        fit === 'cover' && output && source
          ? centredCrop(source, output.width / output.height, isVideo)
          : undefined;
      const quality = qualityOf(recipe.quality);
      const geometry = {
        ...(crop ? { crop } : {}),
        dimensions: output ?? {},
      };
      const settings = isVideo
        ? {
            type: 'video-transform',
            quality,
            ...geometry,
            stripAudio: recipe.stripAudio === true,
            fastConversion: recipe.fastConversion === true,
          }
        : imageSettings(recipe, row.extension, quality, geometry);

      const key = output
        ? settingsKey(settings, output, crop)
        : row.settingsKey;
      const keep =
        key === row.settingsKey ||
        taken.get(row.familyUuid, row.contentHash, key, row.assetUuid);

      update.run(
        JSON.stringify(settings),
        keep ? row.settingsKey : key,
        source
          ? JSON.stringify({ ...meta, sourceDimensions: source })
          : row.meta,
        row.assetUuid,
      );
    }
  },
});

function imageSettings(
  recipe: Recipe,
  extension: string,
  quality: number,
  geometry: Record<string, unknown>,
) {
  const format =
    typeof recipe.format === 'string' && IMAGE_FORMATS.has(recipe.format)
      ? recipe.format
      : extension === 'avif'
        ? 'avif'
        : 'webp';
  return {
    type: 'image-transform',
    quality: format === 'webp-lossless' ? 100 : quality,
    ...geometry,
    format,
  };
}

/** The key a recipe of this shape is stored under from 0.0.2 on. */
function settingsKey(
  settings: Record<string, unknown>,
  output: Size,
  crop: Rect | undefined,
): string {
  const parts = [
    settings.type,
    `q${settings.quality}`,
    `w${output.width}`,
    `h${output.height}`,
    ...(crop
      ? [`crop:${crop.left},${crop.top},${crop.width},${crop.height}`]
      : []),
  ];
  return (
    settings.type === 'video-transform'
      ? [
          ...parts,
          `strip:${settings.stripAudio ? 1 : 0}`,
          `fast:${settings.fastConversion ? 1 : 0}`,
        ]
      : [...parts, `fmt:${settings.format}`]
  ).join(':');
}

/**
 * The largest centred region of the given proportions — what "fill" cut —
 * or nothing when that is the whole source.
 */
function centredCrop(
  source: Size,
  aspect: number,
  even: boolean,
): Rect | undefined {
  const sourceAspect = source.width / source.height;
  const fraction =
    sourceAspect > aspect
      ? { left: (1 - aspect / sourceAspect) / 2, top: 0 }
      : { left: 0, top: (1 - sourceAspect / aspect) / 2 };
  let left = Math.round(fraction.left * source.width);
  let top = Math.round(fraction.top * source.height);
  if (even) {
    left -= left % 2;
    top -= top % 2;
  }
  let width = source.width - 2 * left;
  let height = source.height - 2 * top;
  if (even) {
    width -= width % 2;
    height -= height % 2;
  }
  if (width <= 0 || height <= 0) return undefined;
  if (left === 0 && top === 0) return undefined;
  return { left, top, width, height };
}

function qualityOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(10, Math.min(100, Math.round(value)))
    : 90;
}

function size(
  width: number | undefined,
  height: number | undefined,
): Size | undefined {
  return width && height ? { width, height } : undefined;
}

function parseObject(
  value: string | null,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? Math.round(value) : undefined;
}
