import { ContentValidationError } from '#layers/thei/shared/content';
import type {
  ContentHistoryDiscardRequest,
  ContentHistorySyncResponse,
} from '#layers/thei/shared/content-history';
import {
  discardContentDraft,
  parseContentHistoryField,
  parseContentHistoryWriter,
} from '../../../thei/content/history';

/**
 * The editor was closed without saving: its text becomes a version, and what
 * the form still holds stays protected as the draft.
 */
export default defineEventHandler(
  async (event): Promise<ContentHistorySyncResponse> => {
    const body = await readBody<Partial<ContentHistoryDiscardRequest>>(event);
    const field = body && parseContentHistoryField(body);
    const writer = parseContentHistoryWriter(body?.writer);
    if (!field || !writer)
      throw createError({ statusCode: 400, message: 'Invalid draft' });
    try {
      return discardContentDraft({
        ...field,
        writer,
        replacement: body.replacement,
      });
    } catch (error) {
      if (error instanceof ContentValidationError)
        throw createError({ statusCode: 400, message: error.message });
      throw error;
    }
  },
);
