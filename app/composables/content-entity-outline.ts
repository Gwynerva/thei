import type { ContentEntityOutline } from '#layers/thei/shared/admin/content-entity-outline';
import type { ContentEntityType } from '#layers/thei/shared/content-link';

/**
 * The places inside an entity a link may lead to, as the owner sees them:
 * its headings and, for a project, its sections. Nothing when it is gone; a
 * request that failed otherwise fails, and says nothing of the entity.
 */
export function fetchContentEntityOutline(
  entityType: ContentEntityType,
  entityId: string,
): Promise<ContentEntityOutline | undefined> {
  return $fetch<ContentEntityOutline>('/api/admin/content-entities/outline', {
    query: { entityType, entityId },
  }).catch((error: { statusCode?: number }) => {
    if (error?.statusCode === 404) return undefined;
    throw error;
  });
}
