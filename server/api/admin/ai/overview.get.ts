import type { AiSessionOverview } from '#layers/thei/shared/ai';
import { requireAiOn } from '../../../thei/ai-on';
import { sessionOverview } from '../../../thei/ai/sessions/view';

/** The sessions the dashboard shows: a few that wait, work, or are done. */
export default defineEventHandler((): AiSessionOverview => {
  requireAiOn();
  return sessionOverview();
});
