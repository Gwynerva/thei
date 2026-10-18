import { requireAiOn } from '../../../thei/ai-on';
import { entityAtPath } from '../../../thei/ai/page-entity';
import { markReadOnlyRequest } from '../../../thei/read-only-request';

/**
 * The entity a public page shows, by the page's address: the admin bar's ✦
 * offers a session about it there. None for a page that shows no entity.
 */
export default defineEventHandler((event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  const { path } = getQuery(event);
  return {
    entity: typeof path === 'string' ? (entityAtPath(path) ?? null) : null,
  };
});
