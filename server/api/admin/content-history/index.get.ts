import type { ContentHistoryIndexResponse } from '#layers/thei/shared/content-history';
import {
  parseContentHistoryField,
  readFieldHistory,
} from '../../../thei/content/history';

/** The drafts and the versions of one field, without their texts. */
export default defineEventHandler((event): ContentHistoryIndexResponse => {
  const field = parseContentHistoryField(getQuery(event));
  if (!field) throw createError({ statusCode: 400, message: 'Invalid field' });
  return readFieldHistory(field);
});
