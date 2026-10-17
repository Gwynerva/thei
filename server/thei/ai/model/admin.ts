import { and, avg, eq, gt, gte } from 'drizzle-orm';
import {
  AI_PROVIDERS,
  type AiModelConfig,
  type AiModelSettings,
  type AiProvider,
} from '#layers/thei/shared/ai-model';
import { modelState } from './settings';
import { spentTokens } from './usage';

/** How far back the average of what an answer takes looks. */
const AVERAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** What an answer of the model took over the last month, on average. */
function averageTurn(now = Date.now()): number | null {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiMessages;
  const row = db
    .select({ tokens: avg(table.tokens) })
    .from(table)
    .where(
      and(
        eq(table.role, 'model'),
        gt(table.tokens, 0),
        gte(table.createdAt, now - AVERAGE_WINDOW_MS),
      ),
    )
    .get();
  return row?.tokens == null ? null : Math.round(Number(row.tokens));
}

/** The model's settings as the owner's page reads them: never the key itself. */
export function modelSettings(): AiModelSettings {
  const { model, monthlyTokens } = THEI_SERVER.config.mcp;
  const { apiKey, ...rest } = model;
  return {
    ...rest,
    keySet: Boolean(apiKey),
    keyHint: apiKey.slice(-4),
    monthlyTokens,
    usage: spentTokens(),
    averageTurn: averageTurn(),
    state: modelState(),
  };
}

function shortText(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim().length <= max
    ? value.trim()
    : undefined;
}

/** An address as two of them are compared: no trailing slash. */
function addressOf(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Whether a config speaks to the same service as another: a key is given
 * for one service, and goes to no other. A model turned off speaks to none,
 * and keeps the address of the one it spoke to — Anthropic's is empty,
 * another service's never is.
 */
export function sameService(
  a: Pick<AiModelConfig, 'provider' | 'baseUrl'>,
  b: Pick<AiModelConfig, 'provider' | 'baseUrl'>,
) {
  return (
    (a.provider === b.provider ||
      a.provider === 'none' ||
      b.provider === 'none') &&
    addressOf(a.baseUrl) === addressOf(b.baseUrl)
  );
}

/**
 * The model's settings as the page has them now, saved or not: a key typed
 * in is used for the one call it is sent with and kept nowhere, the saved
 * key when none is — but only towards the service it was saved for. Another
 * service chosen on the page is asked with no key until one is typed.
 */
export function draftModelConfig(body: Record<string, unknown>): AiModelConfig {
  const saved = THEI_SERVER.config.mcp.model;
  const provider = AI_PROVIDERS.includes(body.provider as AiProvider)
    ? (body.provider as AiProvider)
    : saved.provider;
  const baseUrl = shortText(body.baseUrl, 500) ?? saved.baseUrl;
  return {
    provider,
    apiKey:
      shortText(body.apiKey, 500) ||
      (sameService({ provider, baseUrl }, saved) ? saved.apiKey : ''),
    baseUrl,
    model: shortText(body.model, 200) ?? saved.model,
  };
}

/**
 * The model's settings once a change is saved over them. The key stays
 * with its service: moved to another service — another provider or another
 * address — the settings keep no key but a new one, so the old one is
 * never sent where it was not given.
 */
export function savedModelConfig(
  saved: AiModelConfig,
  change: Partial<AiModelConfig>,
): AiModelConfig {
  const next = { ...saved, ...change };
  return change.apiKey === undefined && !sameService(next, saved)
    ? { ...next, apiKey: '' }
    : next;
}
