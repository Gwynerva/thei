import type { TagSynonymSuggestion } from '#layers/thei/shared/tag-recommendation';
import { isTagUuid } from '../../../../thei/tags';
import { findTagSynonymSuggestions } from '../../../../thei/tag-recommendations';

/** Words the tag's own entities use, offered as its synonyms. */
export default defineEventHandler((event): TagSynonymSuggestion[] => {
  const tagUuid = getRouterParam(event, 'tagUuid') ?? '';
  if (!isTagUuid(tagUuid))
    throw createError({ statusCode: 400, message: 'Invalid tag ID' });
  const suggestions = findTagSynonymSuggestions(tagUuid);
  if (!suggestions)
    throw createError({ statusCode: 404, message: 'Tag not found' });
  return suggestions;
});
