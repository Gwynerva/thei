import Anthropic from '@anthropic-ai/sdk';
import type {
  AiCheckResponse,
  AiModelConfig,
} from '#layers/thei/shared/ai-model';
import {
  anthropicError,
  anthropicThinking,
  anthropicUsage,
  chatAddress,
  chatFailure,
  chatHeaders,
  chatUsage,
  ModelError,
  outputLimit,
  refusedThinking,
} from './service';
import type { ModelUsage } from './usage';

/** What a check of one model costs: a word in, a word out. */
const CHECK_PROMPT = 'Answer with the word OK.';
/** How many model names a list keeps: a service may offer hundreds. */
const MODELS_LISTED = 300;

/** A failure as the check says it: what failed, and what the service said. */
function outcomeOf(error: unknown): AiCheckResponse {
  if (error instanceof ModelError)
    return {
      // A service that does not answer in time is one out of reach.
      outcome: error.kind === 'timeout' ? 'address' : error.kind,
      detail: error.detail,
    };
  return {
    outcome: 'error',
    detail: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Tries the model with the settings given, in the smallest call there is —
 * asked as a turn asks it, thinking included, so a model a turn would fail
 * with fails the check too — and says how it went in words the owner's page
 * can tell apart: a key the provider refused, a model it does not know, an
 * address that does not answer, a provider too busy now. What the call
 * spent is counted.
 */
export async function checkModel(
  config: AiModelConfig,
  model: string,
  spend: (usage: ModelUsage) => void,
): Promise<AiCheckResponse> {
  if (config.provider === 'openai') {
    let response: Response;
    try {
      response = await fetch(chatAddress(config.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: chatHeaders(config.apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: CHECK_PROMPT }],
          ...outputLimit(config.baseUrl, 16),
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      return {
        outcome: 'address',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    const text = await response.text().catch(() => '');
    if (!response.ok) return outcomeOf(chatFailure(response.status, text));
    try {
      spend(chatUsage((JSON.parse(text) as { usage?: never }).usage));
    } catch {
      // An answer that is not JSON spent what nobody can tell.
    }
    return { outcome: 'ok', detail: '' };
  }
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: 0,
    timeout: 30_000,
  });
  for (;;)
    try {
      const response = await client.messages.create({
        model,
        // Room for a short thought: only what is written is paid for.
        max_tokens: 1024,
        ...anthropicThinking(model),
        messages: [{ role: 'user', content: CHECK_PROMPT }],
      });
      spend(anthropicUsage(response.usage));
      return { outcome: 'ok', detail: '' };
    } catch (error) {
      // A model that takes no adaptive thinking is asked as a turn would
      // ask it from then on: without.
      if (refusedThinking(model, error)) continue;
      return outcomeOf(anthropicError(error));
    }
}

/**
 * The models a service offers, by name: what the page offers to choose
 * from. Empty when the service lists none or cannot be reached — never an
 * error, since the names can always be typed.
 */
export async function listModels(config: AiModelConfig): Promise<string[]> {
  try {
    if (config.provider === 'anthropic') {
      const client = new Anthropic({
        apiKey: config.apiKey,
        maxRetries: 0,
        timeout: 15_000,
      });
      const names: string[] = [];
      for await (const model of client.models.list({ limit: 100 })) {
        names.push(model.id);
        if (names.length >= MODELS_LISTED) break;
      }
      return names;
    }
    const response = await fetch(chatAddress(config.baseUrl, '/models'), {
      headers: chatHeaders(config.apiKey, false),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    return (body.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string')
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MODELS_LISTED);
  } catch {
    return [];
  }
}
