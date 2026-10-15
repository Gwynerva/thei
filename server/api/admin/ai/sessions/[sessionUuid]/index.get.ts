import type { AiSessionDetail } from '#layers/thei/shared/ai';
import { requireAiOn } from '../../../../../thei/ai-on';
import { sessionDetail } from '../../../../../thei/ai/sessions/view';

/**
 * One session whole, or with `after` the messages after the one a page
 * already has: what a page falls back to when its event stream cannot hold.
 */
export default defineEventHandler(async (event): Promise<AiSessionDetail> => {
  requireAiOn();
  const after = Number(getQuery(event).after);
  const detail = await sessionDetail(
    getRouterParam(event, 'sessionUuid') ?? '',
    Number.isFinite(after) && after > 0 ? after : 0,
  );
  if (!detail) throw createError({ statusCode: 404 });
  return detail;
});
