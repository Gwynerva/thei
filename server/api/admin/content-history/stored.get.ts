import type { ContentHistoryStoredResponse } from '#layers/thei/shared/content-history';
import { buildContentFieldValue } from '../../../thei/content/repository';
import { parseContentHistoryField } from '../../../thei/content/history';

/**
 * The text of a field as it is saved now, as the editor reads it: to compare
 * with when it was saved elsewhere while the editor was being written in.
 */
export default defineEventHandler(
  async (event): Promise<ContentHistoryStoredResponse> => {
    const field = parseContentHistoryField(getQuery(event));
    if (!field)
      throw createError({ statusCode: 400, message: 'Invalid field' });
    const value = await buildContentFieldValue(
      field.ownerType,
      field.ownerRef,
      field.slot,
    );
    if (!value) throw createError({ statusCode: 404 });
    return {
      data: value.data ?? { blocks: [] },
      updatedAt: value.updatedAt ?? 0,
    };
  },
);
