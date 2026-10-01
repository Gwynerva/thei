import type { ContentHistoryEntryResponse } from '#layers/thei/shared/content-history';
import {
  findHistoryEntry,
  historyEntryMeta,
} from '../../../thei/content/history';
import { hydrateContentData } from '../../../thei/content/repository';

/**
 * One version or draft with its text, hydrated as the editor reads it. Files
 * deleted since are left out and counted, so the editor can say so.
 */
export default defineEventHandler(
  async (event): Promise<ContentHistoryEntryResponse> => {
    const row = findHistoryEntry(getRouterParam(event, 'id') ?? '');
    if (!row) throw createError({ statusCode: 404, message: 'Not found' });
    const existing = await Promise.all(
      row.assetUuids.map((assetUuid) =>
        THEI_SERVER.assets.findByUuid(assetUuid),
      ),
    );
    return {
      entry: historyEntryMeta(row),
      data: await hydrateContentData(row.data),
      missingAssets: existing.filter((asset) => !asset).length,
    };
  },
);
