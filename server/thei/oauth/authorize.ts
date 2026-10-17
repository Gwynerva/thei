import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { H3Event } from 'h3';
import {
  API_TOKEN_SCOPES,
  normalizeApiTokenScopes,
  type ApiTokenScope,
} from '#layers/thei/shared/api-token';
import {
  OAUTH_REQUEST_LIFETIME_MS,
  type OAuthRefusal,
} from '#layers/thei/shared/oauth';
import { createAccessToken } from '../access-links/token';
import { mcpResource, oauthIssuer } from './base';
import { OAuthClientError, resolveClient } from './clients';
import { authorizeLimit } from './limits';
import { redirectUriMatches } from './redirect-uri';

/**
 * The first step of a connection: an app sends the owner's browser here with
 * what it asks for. Until the app and the address it named are known to
 * belong together, nothing at all goes back to that address — an unknown app
 * could otherwise use the site to send a browser anywhere — and the owner
 * sees the site's own refusal instead. After that, a fault in the request is
 * told to the app, at its address, as OAuth says.
 */

/** Requests waiting for the owner at once, at most: past it the oldest goes. */
const PENDING_MAX = 50;
const STATE_MAX = 2048;
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

type AuthorizeOutcome =
  | { type: 'refused'; reason: OAuthRefusal }
  /** Too many requests from the address: answered by the site, not the app. */
  | { type: 'busy' }
  | { type: 'redirect'; url: string }
  | { type: 'consent'; requestId: string };

/** The app's address, with an answer for it, and the issuer it came from. */
export function answerUrl(
  redirectUri: string,
  issuer: string,
  answer: Record<string, string | null | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(answer))
    if (value) url.searchParams.set(key, value);
  url.searchParams.set('iss', issuer);
  return url.href;
}

/** The scopes asked for that the site knows; reading when none are. */
export function requestedScopes(value: unknown): ApiTokenScope[] {
  const asked =
    typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
  const known = asked.filter((scope): scope is ApiTokenScope =>
    (API_TOKEN_SCOPES as readonly string[]).includes(scope),
  );
  return normalizeApiTokenScopes(known.length ? known : ['read']);
}

/** Whether the address a key is asked for is this site's MCP endpoint. */
export function resourceAllowed(value: string, expected: string): boolean {
  try {
    const given = new URL(value);
    const own = new URL(expected);
    return (
      given.origin === own.origin &&
      given.pathname.replace(/\/$/, '') === own.pathname.replace(/\/$/, '') &&
      !given.search &&
      !given.hash
    );
  } catch {
    return false;
  }
}

export async function startAuthorization(
  query: Record<string, unknown>,
  event: H3Event,
  ip: string,
): Promise<AuthorizeOutcome> {
  // A parameter given twice is a request nothing can trust (RFC 6749, 3.1).
  if (Object.values(query).some(Array.isArray))
    return { type: 'refused', reason: 'request' };
  // Counted before the app is looked up: one not known yet is read from the
  // address it names, a request out of the site that anyone may ask for.
  if (!authorizeLimit.take(ip)) return { type: 'busy' };

  let client;
  try {
    client = await resolveClient(query.client_id);
  } catch (error) {
    if (error instanceof OAuthClientError)
      return { type: 'refused', reason: error.reason };
    throw error;
  }
  const redirectUri = query.redirect_uri;
  if (
    typeof redirectUri !== 'string' ||
    !client.redirectUris.some((registered) =>
      redirectUriMatches(registered, redirectUri),
    )
  )
    return { type: 'refused', reason: 'redirect_uri' };

  const issuer = oauthIssuer(event);
  const state =
    typeof query.state === 'string' && query.state.length <= STATE_MAX
      ? query.state
      : undefined;
  const fail = (error: string, description: string): AuthorizeOutcome => ({
    type: 'redirect',
    url: answerUrl(redirectUri, issuer, {
      error,
      error_description: description,
      state,
    }),
  });

  if (query.response_type !== 'code')
    return fail('unsupported_response_type', 'Only response_type=code.');
  if (typeof query.state === 'string' && query.state.length > STATE_MAX)
    return fail('invalid_request', 'The state is too long.');
  if (
    typeof query.code_challenge !== 'string' ||
    !CODE_CHALLENGE.test(query.code_challenge) ||
    query.code_challenge_method !== 'S256'
  )
    return fail('invalid_request', 'PKCE with S256 is required.');
  const resource = mcpResource(event);
  if (
    query.resource !== undefined &&
    (typeof query.resource !== 'string' ||
      !resourceAllowed(query.resource, resource))
  )
    return fail('invalid_target', `Keys are issued for ${resource} only.`);

  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  // A request no one answers makes room for a new one rather than turning
  // it away: a few addresses asking without end must not close signing in
  // for every app, and the owner answers theirs within minutes.
  const waiting = db
    .select({ requestId: schema.oauthAuthorizations.requestId })
    .from(schema.oauthAuthorizations)
    .where(
      and(
        isNull(schema.oauthAuthorizations.codeHash),
        gt(schema.oauthAuthorizations.expiresAt, now),
      ),
    )
    // Newest first; two asked within one millisecond, in the order they came.
    .orderBy(desc(schema.oauthAuthorizations.createdAt), sql`rowid desc`)
    .all();
  for (const row of waiting.slice(PENDING_MAX - 1))
    db.delete(schema.oauthAuthorizations)
      .where(eq(schema.oauthAuthorizations.requestId, row.requestId))
      .run();

  const requestId = createAccessToken();
  db.insert(schema.oauthAuthorizations)
    .values({
      requestId,
      clientId: client.clientId,
      redirectUri,
      codeChallenge: query.code_challenge,
      state: state ?? null,
      resource,
      requestedScopes: requestedScopes(query.scope),
      createdAt: now,
      expiresAt: now + OAUTH_REQUEST_LIFETIME_MS,
    })
    .run();
  return { type: 'consent', requestId };
}
