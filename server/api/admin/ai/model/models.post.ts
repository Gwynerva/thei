import type { AiModelsResponse } from '#layers/thei/shared/ai-model';
import { listModels } from '../../../../thei/ai/model/check';
import { draftModelConfig } from '../../../../thei/ai/model/admin';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * The models the chosen service offers, for the page to choose from. A
 * service that lists none, or cannot be reached, gives an empty list, and
 * the page asks for the name as text.
 */
export default defineEventHandler(async (event): Promise<AiModelsResponse> => {
  markReadOnlyRequest(event);
  const config = draftModelConfig(
    (await readBody<Record<string, unknown>>(event)) ?? {},
  );
  if (config.provider === 'none') return { models: [] };
  return { models: await listModels(config) };
});
