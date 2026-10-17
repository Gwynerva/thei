import Anthropic from '@anthropic-ai/sdk';
import type { ModelUsage } from './usage';

/**
 * How Thei speaks to a model's service, the same for a turn as for a check
 * of the model (`check.ts`): where a chat completions server answers and
 * with which headers, how long an answer may be, what a request spent, and
 * why one failed, in kinds the owner's page tells apart. A check that
 * passes with what a turn would send is a check worth having.
 */

/**
 * Why a turn could not be had: a key the service refused, a service busy or
 * out of reach, a model it does not know, a service that fell silent, or
 * anything else it said. `detail` is what it said, for the owner.
 */
export class ModelError extends Error {
  constructor(
    readonly kind: 'key' | 'busy' | 'address' | 'model' | 'timeout' | 'error',
    readonly detail = '',
  ) {
    super(detail || kind);
    this.name = 'ModelError';
  }
}

/** How much of what a service said is kept for the owner. */
const DETAIL_MAX = 300;

/** What Anthropic's API said of a failure, short. */
export function providerDetail(error: InstanceType<typeof Anthropic.APIError>) {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const said = body?.error?.message;
  return (typeof said === 'string' ? said : error.message).slice(0, DETAIL_MAX);
}

/** Kinds of error Anthropic's API sends mid-answer that mean «busy, try later». */
const BUSY_TYPES = new Set([
  'overloaded_error',
  'rate_limit_error',
  'api_error',
]);

/** A failure of Anthropic's API as a `ModelError`; anything else as it was. */
export function anthropicError(error: unknown): unknown {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return new ModelError('key', providerDetail(error));
  if (error instanceof Anthropic.NotFoundError)
    return new ModelError('model', providerDetail(error));
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError
  )
    return new ModelError('busy', providerDetail(error));
  if (error instanceof Anthropic.APIConnectionError)
    return new ModelError('address', error.message);
  if (error instanceof Anthropic.APIError) {
    // An error the service sends mid-answer has no status, only its type.
    const type = (error.error as { error?: { type?: unknown } } | undefined)
      ?.error?.type;
    return new ModelError(
      typeof type === 'string' && BUSY_TYPES.has(type) ? 'busy' : 'error',
      providerDetail(error),
    );
  }
  return error;
}

/**
 * Models that turned adaptive thinking away — an older model, a small one —
 * and are asked without it from then on, by turns and checks alike.
 */
const THINKING_REFUSED = new Set<string>();

/**
 * What a request to Anthropic says of thinking: the model decides how much
 * to think, and its thoughts are shown to no one, so they are not sent back
 * in full either. None for a model that takes no adaptive thinking.
 */
export function anthropicThinking(model: string): {
  thinking?: Anthropic.ThinkingConfigParam;
} {
  return THINKING_REFUSED.has(model)
    ? {}
    : { thinking: { type: 'adaptive', display: 'omitted' } };
}

/**
 * Whether a refusal says the model takes no adaptive thinking: then it is
 * remembered, and the request is asked again without.
 */
export function refusedThinking(model: string, error: unknown): boolean {
  if (THINKING_REFUSED.has(model)) return false;
  if (!(error instanceof Anthropic.BadRequestError)) return false;
  if (!/adaptive|thinking\.(?:type|display)/i.test(providerDetail(error)))
    return false;
  THINKING_REFUSED.add(model);
  return true;
}

/** What one call to Anthropic spent, as its usage says. */
export function anthropicUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): ModelUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

// --- Chat completions ----------------------------------------------------------

/** Where a chat completions server answers `path` — `/chat/completions`, `/models`. */
export function chatAddress(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/** The headers of a request to a chat completions server: the key, if any. */
export function chatHeaders(
  apiKey: string,
  json = true,
): Record<string, string> {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

/**
 * OpenAI's own API takes the limit of an answer under its newer name, and
 * refuses the old one for its newer models; other servers of the format
 * know only the old one.
 */
export function outputLimit(baseUrl: string, tokens: number) {
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

/** What a chat completions server says a call spent. */
export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export function chatUsage(usage: ChatUsage | undefined): ModelUsage {
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cached),
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

/**
 * Why a chat completions server refused, by the status it answered with
 * and what it said.
 */
export function chatFailure(status: number, said: string): ModelError {
  const text = said.slice(0, DETAIL_MAX);
  if (status === 401 || status === 403) return new ModelError('key', text);
  if (status === 404)
    return new ModelError(/model/i.test(text) ? 'model' : 'address', text);
  if (status === 429 || status >= 500) return new ModelError('busy', text);
  return new ModelError(
    /model/i.test(text) ? 'model' : 'error',
    `${status} ${text}`,
  );
}

/**
 * An error a chat completions server put in its answer — mid-stream, or in
 * a body that came with 200 — as a `ModelError`: by the code it gives, when
 * it gives one.
 */
export function chatBodyError(error: unknown): ModelError {
  const said =
    typeof error === 'string'
      ? error
      : ((error as { message?: unknown } | null)?.message ?? '');
  const code = Number((error as { code?: unknown } | null)?.code);
  const text = typeof said === 'string' ? said : JSON.stringify(error);
  return Number.isInteger(code) && code >= 400
    ? chatFailure(code, text)
    : new ModelError('error', text.slice(0, DETAIL_MAX));
}
