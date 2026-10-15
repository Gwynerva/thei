import {
  aiModelName,
  type AiModelStateKind,
} from '#layers/thei/shared/ai-model';
import { tokensLeft } from './usage';

/**
 * The one model the site calls, as the owner set it on «Connection»: who
 * provides it, how to reach it, and which model. Its key never leaves the
 * server.
 */
export interface ModelSettings {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  /** For an OpenAI-compatible service: where its API answers. */
  baseUrl: string;
  model: string;
}

/** Where the model stands: ready, or what it lacks. */
export function modelState(): AiModelStateKind {
  const { enabled, model: config } = THEI_SERVER.config.mcp;
  if (!enabled) return 'off';
  if (config.provider === 'none') return 'none';
  if (config.provider === 'anthropic' && !config.apiKey) return 'no-key';
  if (config.provider === 'openai' && !config.baseUrl.trim())
    return 'no-address';
  if (!aiModelName(config)) return 'no-model';
  if (tokensLeft() <= 0) return 'budget';
  return 'ready';
}

/**
 * The model sessions are answered with, when AI is on and one is set — or,
 * for a template that names its own, that model of the same service.
 */
export function sessionModel(own?: string): ModelSettings | undefined {
  const { enabled, model: config } = THEI_SERVER.config.mcp;
  if (!enabled || config.provider === 'none') return undefined;
  const model = own?.trim() || aiModelName(config);
  if (!model) return undefined;
  if (config.provider === 'anthropic' && config.apiKey)
    return { provider: 'anthropic', apiKey: config.apiKey, baseUrl: '', model };
  if (config.provider === 'openai' && config.baseUrl.trim())
    return {
      provider: 'openai',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl.trim(),
      model,
    };
  return undefined;
}
