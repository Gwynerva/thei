import type { TagCandidateItem } from '#layers/thei/shared/tag-recommendation';
import { isTagUuid } from '../../../../thei/tags';
import { findTagCandidates } from '../../../../thei/tag-recommendations';

export default defineEventHandler(
  async (event): Promise<TagCandidateItem[]> => {
    const tagUuid = getRouterParam(event, 'tagUuid') ?? '';
    if (!isTagUuid(tagUuid))
      throw createError({ statusCode: 400, message: 'Invalid tag ID' });
    const candidates = await findTagCandidates(tagUuid);
    if (!candidates)
      throw createError({ statusCode: 404, message: 'Tag not found' });
    return candidates;
  },
);
