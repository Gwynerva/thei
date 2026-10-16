import { requireAiOn } from '../../../../../thei/ai-on';
import { deleteSession } from '../../../../../thei/ai/sessions/lifecycle';
import { findSession } from '../../../../../thei/ai/sessions/store';
import { stopTurn } from '../../../../../thei/ai/runner/queue';
import { cancelSessionFileJobs } from '../../../../../thei/mcp/file-jobs';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * Deletes a session with all it said and proposed. What its actions applied
 * stays applied; they can no longer be undone from it.
 */
export default defineEventHandler((event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  const sessionUuid = getRouterParam(event, 'sessionUuid') ?? '';
  if (!findSession(sessionUuid)) throw createError({ statusCode: 404 });
  stopTurn(sessionUuid);
  cancelSessionFileJobs(sessionUuid);
  deleteSession(sessionUuid);
  return { deleted: true };
});
