import {
  aiModelName,
  type AiCheckResponse,
} from '#layers/thei/shared/ai-model';
import { checkModel } from '../../../../thei/ai/model/check';
import { draftModelConfig } from '../../../../thei/ai/model/admin';
import { recordUsage } from '../../../../thei/ai/model/usage';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * Tries the model as the page has it now, saved or not: it answers a
 * single word.
 */
export default defineEventHandler(async (event): Promise<AiCheckResponse> => {
  markReadOnlyRequest(event);
  const config = draftModelConfig(
    (await readBody<Record<string, unknown>>(event)) ?? {},
  );
  const model = aiModelName(config);
  if (config.provider === 'none' || !model)
    return { outcome: 'model', detail: '' };
  return checkModel(config, model, (usage) => recordUsage(usage));
});
