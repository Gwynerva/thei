import type { ContentHistoryEntryMeta } from '#layers/thei/shared/content-history';
import {
  listOwnerDrafts,
  parseContentHistoryOwner,
} from '../../../thei/content/history';

/**
 * The unsaved drafts of an owner, newest first: one per field and tab. For
 * `ownerRef=new`, the drafts of everything of that kind never created.
 */
export default defineEventHandler((event): ContentHistoryEntryMeta[] => {
  const owner = parseContentHistoryOwner(getQuery(event), {
    allowNewPlaceholder: true,
  });
  if (!owner) throw createError({ statusCode: 400, message: 'Invalid owner' });
  return listOwnerDrafts(owner.ownerType, owner.ownerRef);
});
