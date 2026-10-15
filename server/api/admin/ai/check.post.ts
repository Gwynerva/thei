import type { AiCheckReport } from '#layers/thei/shared/ai-check';
import { requireAiOn } from '../../../thei/ai-on';
import { checkAiConnection } from '../../../thei/mcp/check';
import { markReadOnlyRequest } from '../../../thei/read-only-request';

/**
 * Tries the way an AI app connects, step by step, from the site itself —
 * as the access key named (`token`), with its rights.
 */
export default defineEventHandler(async (event): Promise<AiCheckReport> => {
  requireAiOn();
  markReadOnlyRequest(event);
  const body = await readBody<{ token?: unknown }>(event).catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : undefined;
  try {
    return await checkAiConnection(event, token);
  } catch (error) {
    if (token) throw createError({ statusCode: 404 });
    throw error;
  }
});
