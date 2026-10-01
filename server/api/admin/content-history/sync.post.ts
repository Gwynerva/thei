import { ContentValidationError } from '#layers/thei/shared/content';
import {
  CONTENT_HISTORY_HINTS,
  type ContentHistorySyncRequest,
  type ContentHistorySyncResponse,
} from '#layers/thei/shared/content-history';
import { isOneOf } from '#layers/thei/shared/utils/isOneOf';
import {
  ContentHistoryOwnerGoneError,
  parseContentHistoryField,
  parseContentHistoryWriter,
  syncContentDraft,
} from '../../../thei/content/history';

/**
 * Stores what an editor holds now as its tab's draft of the field, and tells
 * it which drafts other tabs keep of the same field.
 */
export default defineEventHandler(
  async (event): Promise<ContentHistorySyncResponse> => {
    const body = await readBody<Partial<ContentHistorySyncRequest>>(event);
    const field = body && parseContentHistoryField(body);
    const writer = parseContentHistoryWriter(body?.writer);
    if (!field || !writer)
      throw createError({ statusCode: 400, message: 'Invalid draft' });
    if (body.hint !== undefined && !isOneOf(body.hint, CONTENT_HISTORY_HINTS))
      throw createError({ statusCode: 400, message: 'Invalid hint' });
    try {
      return syncContentDraft({
        ...field,
        writer,
        data: body.data,
        hint: body.hint,
      });
    } catch (error) {
      if (error instanceof ContentHistoryOwnerGoneError)
        throw createError({ statusCode: 410, message: error.message });
      if (error instanceof ContentValidationError)
        throw createError({ statusCode: 400, message: error.message });
      throw error;
    }
  },
);
