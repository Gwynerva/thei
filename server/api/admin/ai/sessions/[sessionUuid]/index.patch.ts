import { requireAiOn } from '../../../../../thei/ai-on';
import { publishSession } from '../../../../../thei/ai/sessions/bus';
import { stopTurn } from '../../../../../thei/ai/runner/queue';
import { cancelSessionFileJobs } from '../../../../../thei/mcp/file-jobs';
import {
  findSession,
  updateSession,
} from '../../../../../thei/ai/sessions/store';
import { cleanSessionTitle } from '../../../../../thei/ai/sessions/names';
import { sessionHead } from '../../../../../thei/ai/sessions/view';
import { markReadOnlyRequest } from '../../../../../thei/read-only-request';

/**
 * Renames, pins or archives a session, and brings one back. Archived by the
 * owner, a session is also closed: its turn stops, the files an app still
 * has on their way into it are cancelled, and an app may not go on with it;
 * brought back, it is open again.
 */
export default defineEventHandler(async (event) => {
  requireAiOn();
  markReadOnlyRequest(event);
  const sessionUuid = getRouterParam(event, 'sessionUuid') ?? '';
  const session = findSession(sessionUuid);
  if (!session) throw createError({ statusCode: 404 });
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const now = Date.now();
  updateSession(sessionUuid, {
    ...(typeof body.title === 'string'
      ? { title: cleanSessionTitle(body.title) }
      : {}),
    ...(typeof body.pinned === 'boolean' ? { pinned: body.pinned } : {}),
    ...(typeof body.archived === 'boolean'
      ? body.archived
        ? {
            archivedAt: session.archivedAt ?? now,
            closedAt: session.closedAt ?? now,
          }
        : { archivedAt: null, closedAt: null }
      : {}),
  });
  if (body.archived === true) {
    stopTurn(sessionUuid);
    cancelSessionFileJobs(sessionUuid);
  }
  publishSession(sessionUuid, { type: 'session' });
  return sessionHead(sessionUuid);
});
