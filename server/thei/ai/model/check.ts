import Anthropic from '@anthropic-ai/sdk';
import type {
  AiCheckResponse,
  AiModelConfig,
} from '#layers/thei/shared/ai-model';
import type { ModelUsage } from './usage';

/** What a check of one model costs: a word in, a word out. */
const CHECK_PROMPT = 'Answer with the word OK.';
/** How many model names a list keeps: a service may offer hundreds. */
const MODELS_LISTED = 300;

function providerDetail(error: InstanceType<typeof Anthropic.APIError>) {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const said = body?.error?.message;
  return (typeof said === 'string' ? said : error.message).slice(0, 300);
}

/**
 * OpenAI's own API takes the limit of an answer under its newer name, and
 * refuses the old one for its newer models; other servers of the format
 * know only the old one.
 */
function outputLimit(baseUrl: string, tokens: number) {
  let host = '';
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    // An address that does not parse fails on the request itself.
  }
  return host === 'api.openai.com'
    ? { max_completion_tokens: tokens }
    : { max_tokens: tokens };
}

/**
 * Tries the model with the settings given, in the smallest call there is,
 * and says how it went in words the owner's page can tell apart: a key the
 * provider refused, a model it does not know, an address that does not
 * answer, a provider too busy now. What the call spent is counted.
 */
export async function checkModel(
  config: AiModelConfig,
  model: string,
  spend: (usage: ModelUsage) => void,
): Promise<AiCheckResponse> {
  if (config.provider === 'openai') {
    let response: Response;
    try {
      response = await fetch(
        `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.apiKey
              ? { authorization: `Bearer ${config.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: CHECK_PROMPT }],
            ...outputLimit(config.baseUrl, 16),
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch (error) {
      return {
        outcome: 'address',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    const text = (await response.text().catch(() => '')).slice(0, 300);
    if (response.status === 401 || response.status === 403)
      return { outcome: 'key', detail: text };
    if (response.status === 404)
      return {
        outcome: /model/i.test(text) ? 'model' : 'address',
        detail: text,
      };
    if (response.status === 429 || response.status >= 500)
      return { outcome: 'busy', detail: text };
    if (!response.ok)
      return {
        outcome: /model/i.test(text) ? 'model' : 'error',
        detail: `${response.status} ${text}`,
      };
    try {
      const usage = (
        JSON.parse(text) as {
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        }
      ).usage;
      spend({
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    } catch {
      // An answer cut at 300 characters may not parse: it spent next to
      // nothing anyway.
    }
    return { outcome: 'ok', detail: '' };
  }
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: 0,
    timeout: 30_000,
  });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: CHECK_PROMPT }],
    });
    spend({
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    });
    return { outcome: 'ok', detail: '' };
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    )
      return { outcome: 'key', detail: providerDetail(error) };
    if (error instanceof Anthropic.NotFoundError)
      return { outcome: 'model', detail: providerDetail(error) };
    if (error instanceof Anthropic.APIConnectionError)
      return { outcome: 'address', detail: error.message };
    if (
      error instanceof Anthropic.RateLimitError ||
      error instanceof Anthropic.InternalServerError
    )
      return { outcome: 'busy', detail: providerDetail(error) };
    if (error instanceof Anthropic.APIError)
      return { outcome: 'error', detail: providerDetail(error) };
    return {
      outcome: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
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
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, '')}/models`,
      {
        headers: config.apiKey
          ? { authorization: `Bearer ${config.apiKey}` }
          : {},
        signal: AbortSignal.timeout(15_000),
      },
    );
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
