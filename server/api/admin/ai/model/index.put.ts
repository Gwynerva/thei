import {
  AI_PROVIDERS,
  type AiModelConfig,
  type AiModelSettings,
  type AiProvider,
} from '#layers/thei/shared/ai-model';
import {
  modelSettings,
  sameService,
  savedModelConfig,
} from '../../../../thei/ai/model/admin';
import { forgetChosenModels } from '../../../../thei/ai/sessions/store';
import { updateTheiConfig } from '../../../../thei/config/write';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

const MAX_TOKENS_LIMIT = 10_000_000_000;

function fail(message: string): never {
  throw createError({ statusCode: 400, message });
}

/**
 * Saves the model's settings. The key is only ever written: a new one
 * replaces it, and leaving it out or empty keeps it — for the same service:
 * another one chosen keeps no key but one typed for it. It is removed on
 * its own (`model/key.delete.ts`).
 */
export default defineEventHandler(async (event): Promise<AiModelSettings> => {
  markReadOnlyRequest(event);
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const change: Partial<AiModelConfig> = {};
  if (body.provider !== undefined) {
    if (!AI_PROVIDERS.includes(body.provider as AiProvider))
      fail('Invalid provider');
    change.provider = body.provider as AiProvider;
  }
  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== 'string' || body.apiKey.trim().length > 500)
      fail('Invalid key');
    if (body.apiKey.trim()) change.apiKey = body.apiKey.trim();
  }
  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== 'string') fail('Invalid address');
    const baseUrl = body.baseUrl.trim();
    if (baseUrl && !/^https?:\/\/[^\s]+$/i.test(baseUrl))
      fail('Invalid address');
    change.baseUrl = baseUrl;
  }
  if (body.model !== undefined) {
    if (typeof body.model !== 'string' || body.model.trim().length > 200)
      fail('Invalid model');
    change.model = body.model.trim();
  }
  let monthlyTokens: number | undefined;
  if (body.monthlyTokens !== undefined) {
    if (
      typeof body.monthlyTokens !== 'number' ||
      !Number.isInteger(body.monthlyTokens) ||
      body.monthlyTokens < 1 ||
      body.monthlyTokens > MAX_TOKENS_LIMIT
    )
      fail('Invalid limit');
    monthlyTokens = body.monthlyTokens;
  }
  const before = THEI_SERVER.config.mcp.model;
  await updateTheiConfig((config) => ({
    ...config,
    mcp: {
      ...config.mcp,
      model: savedModelConfig(config.mcp.model, change),
      ...(monthlyTokens === undefined ? {} : { monthlyTokens }),
    },
  }));
  if (!sameService(before, THEI_SERVER.config.mcp.model)) forgetChosenModels();
  return modelSettings();
});
