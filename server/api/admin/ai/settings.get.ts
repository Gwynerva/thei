import type { AiSettings } from '#layers/thei/shared/ai-settings';

export default defineEventHandler((): AiSettings => ({
  enabled: THEI_SERVER.config.mcp.enabled,
  instructions: THEI_SERVER.config.mcp.instructions,
}));
