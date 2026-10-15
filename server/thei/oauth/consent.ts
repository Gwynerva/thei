import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { H3Event } from 'h3';
import {
  API_TOKEN_LIMIT,
  API_TOKEN_PRESETS,
  normalizeApiTokenScopes,
} from '#layers/thei/shared/api-token';
import {
  OAUTH_CODE_LIFETIME_MS,
  OAUTH_REQUEST_ID,
  type OAuthDecision,
  type OAuthRequestView,
} from '#layers/thei/shared/oauth';
import { createAccessToken, hashAccessToken } from '../access-links/token';
import { cleanApiTokenLabel } from '../api-tokens';
import { oauthIssuer } from './base';
import { answerUrl } from './authorize';
import { describeRedirect } from './redirect-uri';

/**
 * The owner's word on a request for a connection, on a page of the site: who
 * asks, where the browser goes back to, with what rights. A yes gives the
 * app a code it exchanges once, within a minute; a no tells it so.
 */

/** A request still waiting for the owner's word. */
function waiting(requestId: string, now = Date.now()) {
  if (!OAUTH_REQUEST_ID.test(requestId)) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.oauthAuthorizations)
    .where(
      and(
        eq(schema.oauthAuthorizations.requestId, requestId),
        isNull(schema.oauthAuthorizations.codeHash),
        gt(schema.oauthAuthorizations.expiresAt, now),
      ),
    )
    .get();
}

function keyCount(): number {
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db.select({ n: count() }).from(schema.apiTokens).get()?.n ?? API_TOKEN_LIMIT
  );
}

/** A waiting request as its page shows it; none when gone or decided. */
export function readRequest(requestId: string): OAuthRequestView | undefined {
  const row = waiting(requestId);
  if (!row) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const client = db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, row.clientId))
    .get();
  if (!client) return undefined;
  const host =
    client.kind === 'cimd'
      ? new URL(client.clientId).hostname
      : client.uri
        ? new URL(client.uri).hostname
        : '';
  return {
    requestId,
    client: {
      name: client.name,
      kind: client.kind,
      host,
      ...(client.uri ? { uri: client.uri } : {}),
    },
    redirect: describeRedirect(row.redirectUri, host),
    requested: row.requestedScopes,
    connections:
      db
        .select({ n: count() })
        .from(schema.apiTokens)
        .where(eq(schema.apiTokens.clientId, row.clientId))
        .get()?.n ?? 0,
    limitReached: keyCount() >= API_TOKEN_LIMIT,
    label: client.name,
  };
}

export type DecisionOutcome =
  { type: 'redirect'; url: string } | { type: 'gone' } | { type: 'limit' };

/**
 * The owner's answer. Yes: a one-time code for the app, with the rights the
 * owner chose — which may be more or fewer than it asked for; the answer it
 * gets back says which. No: the app is told the owner declined.
 */
export function decideRequest(
  requestId: string,
  decision: OAuthDecision,
  event: H3Event,
): DecisionOutcome {
  const row = waiting(requestId);
  if (!row) return { type: 'gone' };
  const issuer = oauthIssuer(event);
  const { db, schema } = THEI_SERVER.useDb();
  if (!decision.allow) {
    db.delete(schema.oauthAuthorizations)
      .where(eq(schema.oauthAuthorizations.requestId, requestId))
      .run();
    return {
      type: 'redirect',
      url: answerUrl(row.redirectUri, issuer, {
        error: 'access_denied',
        error_description: 'The owner declined.',
        state: row.state,
      }),
    };
  }
  if (keyCount() >= API_TOKEN_LIMIT) return { type: 'limit' };
  const preset = decision.preset === 'editor' ? 'editor' : 'reader';
  const code = createAccessToken();
  const now = Date.now();
  const client = db
    .select({ name: schema.oauthClients.name })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, row.clientId))
    .get();
  db.update(schema.oauthAuthorizations)
    .set({
      codeHash: hashAccessToken(code),
      grantedScopes: normalizeApiTokenScopes(API_TOKEN_PRESETS[preset]),
      label: cleanApiTokenLabel(decision.label) || client?.name || 'App',
      expiresAt: now + OAUTH_CODE_LIFETIME_MS,
    })
    .where(eq(schema.oauthAuthorizations.requestId, requestId))
    .run();
  return {
    type: 'redirect',
    url: answerUrl(row.redirectUri, issuer, { code, state: row.state }),
  };
}
