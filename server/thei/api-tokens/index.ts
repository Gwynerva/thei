import { and, eq, isNull, lt, ne, or } from 'drizzle-orm';
import { createError, getHeader, type H3Event } from 'h3';
import {
  API_TOKEN_LABEL_MAX,
  API_TOKEN_LIMIT,
  API_TOKEN_PREFIX,
  API_TOKEN_PRESETS,
  normalizeApiTokenScopes,
  type ApiTokenCreateResponse,
  type ApiTokenItem,
  type ApiTokenPreset,
  type ApiTokenScope,
} from '#layers/thei/shared/api-token';
import {
  createAccessToken,
  hashAccessToken,
  isAccessTokenShape,
} from '../access-links/token';
import { generateUniqueId, EntityPrefix } from '../entity-id';
import { getRequestIp } from '../request';

/**
 * Tokens for AI clients working with the site over MCP.
 *
 * A token is shown once, when it is made; the database keeps its hash, so a
 * leaked backup opens nothing. The lookup is by hash, which is exact, so no
 * comparison timing leaks either.
 */

/** `lastUsedAt` moves at most this often, so a busy client costs no writes. */
const LAST_USED_RESOLUTION_MS = 60 * 1000;

export interface ApiTokenPrincipal {
  tokenUuid: string;
  label: string;
  scopes: ApiTokenScope[];
}

function toItem(
  row: {
    tokenUuid: string;
    label: string;
    scopes: ApiTokenScope[];
    createdAt: number;
    lastUsedAt: number | null;
    lastClient: string | null;
    kind: 'token' | 'oauth';
    clientId?: string | null;
  },
  clients: Map<
    string,
    { name: string; kind: 'cimd' | 'dcr'; uri: string | null }
  > = new Map(),
): ApiTokenItem {
  const client = row.clientId ? clients.get(row.clientId) : undefined;
  const host = (value: string | null | undefined) => {
    try {
      return value ? new URL(value).hostname : '';
    } catch {
      return '';
    }
  };
  return {
    tokenUuid: row.tokenUuid,
    label: row.label,
    scopes: row.scopes,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    lastClient: row.lastClient,
    kind: row.kind,
    ...(client && row.clientId
      ? {
          client: {
            name: client.name,
            host:
              client.kind === 'cimd' ? host(row.clientId) : host(client.uri),
            verified: client.kind === 'cimd',
          },
        }
      : {}),
  };
}

export function listApiTokens(): ApiTokenItem[] {
  const { db, schema } = THEI_SERVER.useDb();
  const clients = new Map(
    db
      .select()
      .from(schema.oauthClients)
      .all()
      .map((client) => [client.clientId, client]),
  );
  return db
    .select()
    .from(schema.apiTokens)
    .all()
    .map((row) => toItem(row, clients))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function cleanApiTokenLabel(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, API_TOKEN_LABEL_MAX)
    : '';
}

export async function createApiToken(
  label: string,
  preset: ApiTokenPreset,
): Promise<ApiTokenCreateResponse> {
  const { db, schema } = THEI_SERVER.useDb();
  if (db.select().from(schema.apiTokens).all().length >= API_TOKEN_LIMIT)
    throw createError({
      statusCode: 429,
      message: THEI_SERVER.phrase.api_token_too_many,
    });

  const token = `${API_TOKEN_PREFIX}${createAccessToken()}`;
  const tokenUuid = await generateUniqueId(
    EntityPrefix.ApiToken,
    async (id) =>
      !db
        .select({ id: schema.apiTokens.tokenUuid })
        .from(schema.apiTokens)
        .where(eq(schema.apiTokens.tokenUuid, id))
        .get(),
  );
  const row = {
    tokenUuid,
    label,
    tokenHash: hashAccessToken(token),
    scopes: normalizeApiTokenScopes(API_TOKEN_PRESETS[preset]),
    createdAt: Date.now(),
    lastUsedAt: null,
    lastClient: null,
    kind: 'token' as const,
  };
  db.insert(schema.apiTokens).values(row).run();
  return { token, item: toItem(row) };
}

/** Whether a token existed; revoking is deleting, so it stops at once. */
export function revokeApiToken(tokenUuid: string): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  const result = db
    .delete(schema.apiTokens)
    .where(eq(schema.apiTokens.tokenUuid, tokenUuid))
    .run();
  return result.changes > 0;
}

function bearerToken(event: H3Event): string | undefined {
  const header = getHeader(event, 'authorization');
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1];
}

/**
 * Why a request to the MCP endpoint was not let in: it carries no key — an
 * app finding out how to connect — one that does not exist, a connection's
 * key past its hour, or one issued for another address.
 */
export type McpRefusal = 'missing' | 'unknown' | 'expired' | 'audience';

/** The key a request carries, or why it was not let in. */
export function authenticateMcpRequest(
  event: H3Event,
  resource?: string,
  now = Date.now(),
): { principal: ApiTokenPrincipal } | { refused: McpRefusal } {
  const token = bearerToken(event);
  if (!token) return { refused: 'missing' };
  if (!isAccessTokenShape(token)) return { refused: 'unknown' };
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.tokenHash, hashAccessToken(token)))
    .get();
  if (!row) return { refused: 'unknown' };
  if (row.kind === 'oauth') {
    if ((row.accessExpiresAt ?? 0) <= now) return { refused: 'expired' };
    if (resource && row.resource !== resource) return { refused: 'audience' };
  }
  return {
    principal: {
      tokenUuid: row.tokenUuid,
      label: row.label,
      scopes: row.scopes,
    },
  };
}

/**
 * Notes that a token was used, at most once a minute: called once its
 * request is let through, so a refused one leaves no trace.
 */
export function touchApiToken(tokenUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  db.update(schema.apiTokens)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(schema.apiTokens.tokenUuid, tokenUuid),
        or(
          isNull(schema.apiTokens.lastUsedAt),
          lt(schema.apiTokens.lastUsedAt, now - LAST_USED_RESOLUTION_MS),
        ),
      ),
    )
    .run();
}

/** Whether a token still exists: revoked, what it opened opens nothing. */
export function apiTokenExists(tokenUuid: string): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  return Boolean(
    db
      .select({ id: schema.apiTokens.tokenUuid })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenUuid, tokenUuid))
      .get(),
  );
}

/**
 * Notes the client a token was used by, when it changes: what tells the owner
 * that a client they set up did connect.
 */
export function recordApiTokenClient(tokenUuid: string, client: string) {
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.apiTokens)
    .set({ lastClient: client })
    .where(
      and(
        eq(schema.apiTokens.tokenUuid, tokenUuid),
        or(
          isNull(schema.apiTokens.lastClient),
          ne(schema.apiTokens.lastClient, client),
        ),
      ),
    )
    .run();
}

const FAILURE_COOLDOWN_MS = 3000;
const failures = new Map<string, number>();

/**
 * One failed attempt per address every few seconds. Kept apart from the
 * sign-in limiter, so a misconfigured client cannot lock the owner out of
 * the admin panel.
 */
export function isApiTokenFailureLimited(event: H3Event): boolean {
  const ip = getRequestIp(event) ?? 'unknown';
  return Date.now() < (failures.get(ip) ?? 0);
}

export function recordApiTokenFailure(event: H3Event): void {
  const ip = getRequestIp(event) ?? 'unknown';
  const now = Date.now();
  failures.set(ip, now + FAILURE_COOLDOWN_MS);
  if (failures.size > 1000)
    for (const [key, until] of failures) if (now >= until) failures.delete(key);
}

type BudgetKind = 'call' | 'write';

const BUDGET_WINDOW_MS = 60 * 1000;
const BUDGET_LIMITS: Record<BudgetKind, number> = { call: 120, write: 30 };
const budgets = new Map<string, number[]>();

/**
 * Spends one call or write of a token's budget for the current minute.
 * Returns the seconds to wait when the budget is spent, or `0`.
 */
export function spendApiTokenBudget(
  tokenUuid: string,
  kind: BudgetKind,
): number {
  const key = `${kind}:${tokenUuid}`;
  const now = Date.now();
  const recent = (budgets.get(key) ?? []).filter(
    (at) => now - at < BUDGET_WINDOW_MS,
  );
  if (recent.length >= BUDGET_LIMITS[kind]) {
    budgets.set(key, recent);
    return Math.max(1, Math.ceil((recent[0]! + BUDGET_WINDOW_MS - now) / 1000));
  }
  recent.push(now);
  budgets.set(key, recent);
  return 0;
}
