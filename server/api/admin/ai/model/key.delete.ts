import type { AiModelSettings } from '#layers/thei/shared/ai-model';
import { modelSettings } from '../../../../thei/ai/model/admin';
import { updateTheiConfig } from '../../../../thei/config/write';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * Forgets the model's key, and nothing else: the settings being edited on
 * the page stay as they are, saved or not.
 */
export default defineEventHandler(async (event): Promise<AiModelSettings> => {
  markReadOnlyRequest(event);
  await updateTheiConfig((config) => ({
    ...config,
    mcp: { ...config.mcp, model: { ...config.mcp.model, apiKey: '' } },
  }));
  return modelSettings();
});
