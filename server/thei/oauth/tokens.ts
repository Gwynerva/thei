import { createHash, randomUUID } from 'node:crypto';
import { count, eq, or } from 'drizzle-orm';
import {
  API_TOKEN_LIMIT,
  type ApiTokenScope,
} from '#layers/thei/shared/api-token';
import {
  OAUTH_ACCESS_LIFETIME_MS,
  OAUTH_ACCESS_PREFIX,
  OAUTH_REFRESH_GRACE_MS,
  OAUTH_REFRESH_LIFETIME_MS,
  OAUTH_REFRESH_PREFIX,
} from '#layers/thei/shared/oauth';
import { createAccessToken, hashAccessToken } from '../access-links/token';
import { EntityPrefix } from '../entity-id';
import { requestedScopes, resourceAllowed } from './authorize';
import { touchClient } from './clients';
import { oauthError, type OAuthAnswer } from './http';

/**
 * Where an app turns a code into a connection, and renews it. A connection
 * is a row of the access keys like any other: its id never changes, so its
 * rights and its sessions stay its own; only its two keys
 * change with every renewal, and the old access key dies at once.
 */

/** What the app keeps: a key for an hour, and the key that renews it. */
function issueKeys(now: number) {
  const access = `${OAUTH_ACCESS_PREFIX}${createAccessToken()}`;
  const refresh = `${OAUTH_REFRESH_PREFIX}${createAccessToken()}`;
  return {
    access,
    refresh,
    columns: {
      tokenHash: hashAccessToken(access),
      accessExpiresAt: now + OAUTH_ACCESS_LIFETIME_MS,
      refreshHash: hashAccessToken(refresh),
      refreshExpiresAt: now + OAUTH_REFRESH_LIFETIME_MS,
    },
  };
}

function keysAnswer(
  keys: { access: string; refresh: string },
  scopes: ApiTokenScope[],
): OAuthAnswer {
  return {
    status: 200,
    body: {
      access_token: keys.access,
      token_type: 'Bearer',
      expires_in: OAUTH_ACCESS_LIFETIME_MS / 1000,
      refresh_token: keys.refresh,
      scope: scopes.join(' '),
    },
  };
}

/** PKCE: the verifier the app kept hashes to the challenge it sent. */
function verifierMatches(verifier: unknown, challenge: string): boolean {
  if (
    typeof verifier !== 'string' ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
  )
    return false;
  return (
    createHash('sha256').update(verifier).digest('base64url') === challenge
  );
}

/** The `authorization_code` grant: one code, once, into a connection. */
export function exchangeCode(
  params: Record<string, unknown>,
  expectedResource: string,
  now = Date.now(),
): OAuthAnswer {
  if (typeof params.code !== 'string' || !params.code)
    return oauthError('invalid_request', 'code is missing.');
  const { db, schema } = THEI_SERVER.useDb();
  // One step, nothing awaited: a code exchanged twice at once is found used
  // by the second, whichever comes first.
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(schema.oauthAuthorizations)
      .where(
        eq(
          schema.oauthAuthorizations.codeHash,
          hashAccessToken(params.code as string),
        ),
      )
      .get();
    if (!row) return oauthError('invalid_grant', 'Unknown code.');
    if (row.usedAt) {
      // A code used twice was seen by someone else: what it opened closes.
      if (row.tokenUuid)
        tx.delete(schema.apiTokens)
          .where(eq(schema.apiTokens.tokenUuid, row.tokenUuid))
          .run();
      return oauthError('invalid_grant', 'The code was used already.');
    }
    if (row.expiresAt <= now)
      return oauthError('invalid_grant', 'The code has expired.');
    if (params.client_id !== row.clientId)
      return oauthError('invalid_grant', 'The code is another app’s.');
    if (params.redirect_uri !== row.redirectUri)
      return oauthError('invalid_grant', 'redirect_uri differs.');
    if (!verifierMatches(params.code_verifier, row.codeChallenge))
      return oauthError('invalid_grant', 'code_verifier does not match.');
    if (
      params.resource !== undefined &&
      (typeof params.resource !== 'string' ||
        !resourceAllowed(params.resource, expectedResource))
    )
      return oauthError('invalid_target', 'Another resource was authorized.');
    const keyCount =
      tx.select({ n: count() }).from(schema.apiTokens).get()?.n ?? 0;
    if (keyCount >= API_TOKEN_LIMIT)
      return oauthError('invalid_grant', 'The site holds all the keys it may.');

    const scopes = row.grantedScopes ?? ['read'];
    const keys = issueKeys(now);
    const tokenUuid = `${EntityPrefix.ApiToken}-${randomUUID()}`;
    tx.insert(schema.apiTokens)
      .values({
        tokenUuid,
        label: row.label ?? 'App',
        scopes,
        createdAt: now,
        lastUsedAt: null,
        lastClient: null,
        kind: 'oauth',
        clientId: row.clientId,
        resource: row.resource,
        ...keys.columns,
      })
      .run();
    tx.update(schema.oauthAuthorizations)
      .set({ usedAt: now, tokenUuid })
      .where(eq(schema.oauthAuthorizations.requestId, row.requestId))
      .run();
    touchClient(row.clientId, now);
    return keysAnswer(keys, scopes);
  });
}

/**
 * The `refresh_token` grant: both keys anew, the old access key dead at
 * once. The refresh key just replaced is refused quietly for a few seconds —
 * two workers of one app renewing together — and after that is taken as a
 * stolen copy: the connection goes.
 */
export function renewKeys(
  params: Record<string, unknown>,
  expectedResource: string,
  now = Date.now(),
): OAuthAnswer {
  if (typeof params.refresh_token !== 'string' || !params.refresh_token)
    return oauthError('invalid_request', 'refresh_token is missing.');
  const hash = hashAccessToken(params.refresh_token);
  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(schema.apiTokens)
      .where(
        or(
          eq(schema.apiTokens.refreshHash, hash),
          eq(schema.apiTokens.previousRefreshHash, hash),
        ),
      )
      .get();
    if (!row || row.kind !== 'oauth')
      return oauthError('invalid_grant', 'Unknown refresh token.');
    const drop = () =>
      tx
        .delete(schema.apiTokens)
        .where(eq(schema.apiTokens.tokenUuid, row.tokenUuid))
        .run();
    if (row.refreshHash !== hash) {
      if (now - (row.refreshedAt ?? 0) <= OAUTH_REFRESH_GRACE_MS)
        return oauthError('invalid_grant', 'Renewed a moment ago.');
      drop();
      return oauthError('invalid_grant', 'The refresh token was used already.');
    }
    if ((row.refreshExpiresAt ?? 0) <= now) {
      drop();
      return oauthError('invalid_grant', 'The connection has expired.');
    }
    if (params.client_id !== row.clientId)
      return oauthError('invalid_grant', 'The token is another app’s.');
    if (
      params.resource !== undefined &&
      (typeof params.resource !== 'string' ||
        !resourceAllowed(params.resource, expectedResource))
    )
      return oauthError('invalid_target', 'Another resource was authorized.');
    const scopes = row.scopes;
    if (
      params.scope !== undefined &&
      !requestedScopes(params.scope).every((scope) => scopes.includes(scope))
    )
      return oauthError('invalid_scope', 'More than was granted.');

    const keys = issueKeys(now);
    tx.update(schema.apiTokens)
      .set({
        ...keys.columns,
        previousRefreshHash: hash,
        refreshedAt: now,
      })
      .where(eq(schema.apiTokens.tokenUuid, row.tokenUuid))
      .run();
    return keysAnswer(keys, scopes);
  });
}

/**
 * Token revocation (RFC 7009): either of a connection's keys ends it, for
 * the app it belongs to. Always answered the same, so it tells nothing.
 */
export function revokeKey(params: Record<string, unknown>): void {
  if (typeof params.token !== 'string' || !params.token) return;
  const hash = hashAccessToken(params.token);
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({
      tokenUuid: schema.apiTokens.tokenUuid,
      clientId: schema.apiTokens.clientId,
      kind: schema.apiTokens.kind,
    })
    .from(schema.apiTokens)
    .where(
      or(
        eq(schema.apiTokens.tokenHash, hash),
        eq(schema.apiTokens.refreshHash, hash),
      ),
    )
    .get();
  if (!row || row.kind !== 'oauth') return;
  if (params.client_id !== undefined && params.client_id !== row.clientId)
    return;
  db.delete(schema.apiTokens)
    .where(eq(schema.apiTokens.tokenUuid, row.tokenUuid))
    .run();
}
