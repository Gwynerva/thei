import { markReadOnlyRequest } from '../../../thei/read-only-request';
import {
  AI_INSTRUCTIONS_MAX,
  type AiSettings,
} from '#layers/thei/shared/ai-settings';
import { updateTheiConfig } from '../../../thei/config/write';
import { stopAllTurns } from '../../../thei/ai/runner/queue';

/**
 * Turns AI access on or off, and saves the owner's instructions to AI
 * clients. Both take effect at once. Off, the MCP endpoint is gone and every
 * token opens nothing, though the tokens are kept for when it is on again;
 * whatever the model or an app has under way stops — the route that would
 * stop a turn is gone with it.
 */
export default defineEventHandler(async (event): Promise<AiSettings> => {
  markReadOnlyRequest(event);
  const body = await readBody<{ enabled?: unknown; instructions?: unknown }>(
    event,
  );
  if (body?.enabled !== undefined && typeof body.enabled !== 'boolean')
    throw createError({ statusCode: 400, message: 'Invalid switch' });
  if (body?.instructions !== undefined && typeof body.instructions !== 'string')
    throw createError({ statusCode: 400, message: 'Invalid instructions' });
  await updateTheiConfig((config) => ({
    ...config,
    mcp: {
      ...config.mcp,
      enabled:
        typeof body?.enabled === 'boolean' ? body.enabled : config.mcp.enabled,
      // Stored as typed, as everything the owner writes is.
      instructions:
        typeof body?.instructions === 'string'
          ? body.instructions.slice(0, AI_INSTRUCTIONS_MAX)
          : config.mcp.instructions,
    },
  }));
  if (body?.enabled === false) stopAllTurns();
  return {
    enabled: THEI_SERVER.config.mcp.enabled,
    instructions: THEI_SERVER.config.mcp.instructions,
  };
});
