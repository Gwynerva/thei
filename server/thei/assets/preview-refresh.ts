import { and, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { AssetType } from '#layers/thei/shared/asset';
import {
  completeVideoMeta,
  refreshMediaPreview,
  type StoredAssetRecord,
} from './storage';
import { svgNeedsUseSizes } from './svg-raster-input';

/**
 * Videos whose preview frame was not chosen by colour.
 *
 * A preview made since frames were compared records how well its frame
 * shows the video; one made before does not, whatever it shows. The
 * oldest-touched go first, so a pass cut short picks up roughly where it
 * stopped.
 */
export async function findVideosWithUnscoredPreviews(): Promise<
  StoredAssetRecord[]
> {
  const { db, schema } = THEI_SERVER.useDb();
  return await db
    .select()
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.type, AssetType.Video),
        isNotNull(schema.assets.settings),
        sql`json_extract(${schema.assets.meta}, '$.previewScore') IS NULL`,
      ),
    )
    .orderBy(schema.assets.touchedAt);
}

/** Every SVG in the library, whose preview used to be drawn at its own size. */
export async function findSvgAssets(): Promise<StoredAssetRecord[]> {
  const { db, schema } = THEI_SERVER.useDb();
  return await db
    .select()
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.extension, 'svg'),
        isNotNull(schema.assets.settings),
      ),
    )
    .orderBy(schema.assets.touchedAt);
}

export interface RefreshPreviewsOptions {
  /** Told after each file, and once before the first. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

export interface RefreshPreviewsResult {
  total: number;
  /** Files that could not be read and keep their old preview. */
  failed: number;
}

/**
 * Remakes the previews of the given files one at a time. A file that cannot
 * be read is skipped and reported, and keeps its old preview.
 */
async function refreshPreviews(
  assets: StoredAssetRecord[],
  noun: string,
  options: RefreshPreviewsOptions,
): Promise<RefreshPreviewsResult> {
  const console = THEI_SERVER.console.tag('Assets');
  if (assets.length)
    console.log(`Remaking the previews of ${assets.length} ${noun}...`);
  await options.onProgress?.(0, assets.length);

  let done = 0;
  let failed = 0;
  for (const asset of assets) {
    try {
      await refreshMediaPreview(asset);
    } catch (error) {
      failed += 1;
      console.error(
        `Could not remake the preview of ${asset.assetUuid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    done += 1;
    await options.onProgress?.(done, assets.length);
  }

  if (assets.length)
    console.log(
      `Previews remade for ${assets.length - failed} of ${assets.length} ${noun}.`,
    );
  return { total: assets.length, failed };
}

/**
 * Chooses the preview frame of every video whose frame was not compared by
 * colour. Each video costs a few seconds of decoding in the video lane, so a
 * library of a hundred videos takes a few minutes; one dealt with is never
 * looked at again.
 */
export async function refreshVideoPreviews(
  options: RefreshPreviewsOptions = {},
): Promise<RefreshPreviewsResult> {
  return await refreshPreviews(
    await findVideosWithUnscoredPreviews(),
    'video(s)',
    options,
  );
}

/**
 * Reads the length, frame rate, bit rate and audio of every video stored
 * before they were recorded, once, so nothing has to probe a file when it is
 * shown. A file that cannot be read is left as it is.
 */
export async function completeVideoMetas(): Promise<void> {
  const { db, schema } = THEI_SERVER.useDb();
  const videos = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.type, AssetType.Video));
  for (const video of videos) await completeVideoMeta(video);
}

/** Draws the preview of every SVG again, at the size a preview is shown. */
export async function refreshSvgPreviews(
  options: RefreshPreviewsOptions = {},
): Promise<RefreshPreviewsResult> {
  return await refreshPreviews(await findSvgAssets(), 'SVG file(s)', options);
}

/**
 * SVGs with a `<use>` of a sized symbol or nested drawing, which librsvg drew
 * at the size of the whole picture until their inputs were prepared for it
 * (`svg-raster-input.ts`).
 * A file that cannot be read is left out: it keeps its preview either way.
 */
export async function findSvgAssetsWithUnsizedUses(): Promise<
  StoredAssetRecord[]
> {
  const found: StoredAssetRecord[] = [];
  for (const asset of await findSvgAssets()) {
    const path = THEI_SERVER.assets.filePath(
      asset.contentHash,
      asset.extension,
    );
    if (await svgNeedsUseSizes(path).catch(() => false)) found.push(asset);
  }
  return found;
}

export interface RefreshSvgUsePreviewsResult extends RefreshPreviewsResult {
  /**
   * Bitmaps saved from those SVGs. Their pixels are the file itself, drawn
   * wrong once and for all: saving the picture again from its SVG redraws it.
   */
  rasterised: StoredAssetRecord[];
}

/**
 * Draws again the previews of those SVGs, and the accent colour with them,
 * and finds the bitmaps once saved from them.
 */
export async function refreshSvgUsePreviews(
  options: RefreshPreviewsOptions = {},
): Promise<RefreshSvgUsePreviewsResult> {
  const assets = await findSvgAssetsWithUnsizedUses();
  const result = await refreshPreviews(
    assets,
    'SVG file(s) reusing sized parts',
    options,
  );
  const families = [...new Set(assets.map((asset) => asset.familyUuid))];
  if (!families.length) return { ...result, rasterised: [] };
  const { db, schema } = THEI_SERVER.useDb();
  const rasterised = await db
    .select()
    .from(schema.assets)
    .where(
      and(
        inArray(schema.assets.familyUuid, families),
        eq(schema.assets.type, AssetType.Image),
        ne(schema.assets.extension, 'svg'),
        isNotNull(schema.assets.settings),
      ),
    );
  return { ...result, rasterised };
}
