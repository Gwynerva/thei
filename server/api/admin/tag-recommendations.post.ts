import { isRelationEntityType } from '#layers/thei/shared/relation';
import { TAG_CONTAINER_TYPES } from '#layers/thei/shared/tag';
import {
  clampTagContextText,
  type TagRecommendation,
  type TagRecommendationRequest,
} from '#layers/thei/shared/tag-recommendation';
import { isOneOf } from '#layers/thei/shared/utils/isOneOf';
import { isTagUuid } from '../../thei/tags';
import { markReadOnlyRequest } from '../../thei/read-only-request';
import { recommendTagsForDraft } from '../../thei/tag-recommendations';

export default defineEventHandler(
  async (event): Promise<TagRecommendation[]> => {
    markReadOnlyRequest(event);
    return recommendTagsForDraft(parseRequest(await readBody<unknown>(event)));
  },
);

function fail(message: string): never {
  throw createError({ statusCode: 400, message });
}

function parseRequest(body: unknown): TagRecommendationRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    fail('Invalid request body');
  const item = body as Partial<Record<keyof TagRecommendationRequest, unknown>>;
  const title = item.title ?? '';
  const text = item.text ?? '';
  if (typeof title !== 'string' || typeof text !== 'string')
    fail('Invalid recommendation text');
  const selectedTagUuids = item.selectedTagUuids ?? [];
  if (
    !Array.isArray(selectedTagUuids) ||
    selectedTagUuids.length > 100 ||
    selectedTagUuids.some(
      (uuid) => typeof uuid !== 'string' || !isTagUuid(uuid),
    )
  )
    fail('Invalid selected tags');
  const related = item.related ?? [];
  if (
    !Array.isArray(related) ||
    related.length > 1_000 ||
    related.some(
      (endpoint) =>
        !endpoint ||
        typeof endpoint !== 'object' ||
        !isRelationEntityType(endpoint.type) ||
        typeof endpoint.id !== 'string',
    )
  )
    fail('Invalid related entities');
  const owner = item.owner as TagRecommendationRequest['owner'] | undefined;
  if (
    owner !== undefined &&
    (!owner ||
      typeof owner !== 'object' ||
      !isOneOf(owner.type, TAG_CONTAINER_TYPES) ||
      typeof owner.id !== 'string')
  )
    fail('Invalid owner');
  return {
    owner,
    title: title.slice(0, 1_000),
    text: clampTagContextText(text),
    selectedTagUuids: selectedTagUuids as string[],
    related: related as TagRecommendationRequest['related'],
  };
}
