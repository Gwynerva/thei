import { and, eq, sql } from 'drizzle-orm';
import { AssetType } from '#layers/thei/shared/asset';
import { refreshMediaPreview, type StoredAssetRecord } from './storage';

/**
 * Videos whose preview is still their first frame.
 *
 * A preview made since frames were chosen records where its frame came from;
 * one made before does not, whatever it shows. The oldest-touched go first,
 * so a pass cut short picks up roughly where it stopped.
 */
export async function findVideosWithFirstFramePreviews(): Promise<
  StoredAssetRecord[]
> {
  const { db, schema } = THEI_SERVER.useDb();
  return await db
    .select()
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.type, AssetType.Video),
        sql`json_extract(${schema.assets.meta}, '$.previewAt') IS NULL`,
      ),
    )
    .orderBy(schema.assets.touchedAt);
}

export interface RefreshFirstFramePreviewsOptions {
  /** Told after each video, and once before the first. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

export interface RefreshFirstFramePreviewsResult {
  total: number;
  /** Videos that could not be read and keep their old preview. */
  failed: number;
}

/**
 * Remakes every preview that is still a first frame, one video at a time.
 *
 * Each video costs a few seconds of decoding in the video lane, so a library
 * of a hundred videos takes a few minutes. A video that cannot be read is
 * skipped and reported; one dealt with is never looked at again.
 */
export async function refreshFirstFramePreviews(
  options: RefreshFirstFramePreviewsOptions = {},
): Promise<RefreshFirstFramePreviewsResult> {
  const videos = await findVideosWithFirstFramePreviews();
  const console = THEI_SERVER.console.tag('Assets');
  if (videos.length) {
    console.log(`Choosing preview frames for ${videos.length} video(s)...`);
  }
  await options.onProgress?.(0, videos.length);

  let done = 0;
  let failed = 0;
  for (const video of videos) {
    try {
      await refreshMediaPreview(video);
    } catch (error) {
      failed += 1;
      console.error(
        `Could not remake the preview of ${video.assetUuid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    done += 1;
    await options.onProgress?.(done, videos.length);
  }

  if (videos.length) {
    console.log(
      `Preview frames chosen for ${videos.length - failed} of ${videos.length} video(s).`,
    );
  }
  return { total: videos.length, failed };
}
