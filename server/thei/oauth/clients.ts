import { randomUUID } from 'node:crypto';
import { and, count, eq, isNull, lt, or } from 'drizzle-orm';
import { fetchGuarded } from '../external-links/fetch';
import { EntityPrefix } from '../entity-id';
import { REDIRECT_URI_MAX, redirectUriAllowed } from './redirect-uri';

/**
 * The apps that may ask for a connection. One that publishes a description
 * of itself at an address (a Client ID Metadata Document) is known by that
 * address, which is its id: it is read from there, checked, and kept for as
 * long as it says it may be. One that cannot registers itself (Dynamic
 * Client Registration) and gets an id from the site. Either way, an app is
 * no permission: the owner decides each connection.
 */

export interface OAuthClient {
  clientId: string;
  kind: 'cimd' | 'dcr';
  name: string;
  uri: string | null;
  redirectUris: string[];
}

/** Why an app could not be known. */
export class OAuthClientError extends Error {
  constructor(readonly reason: 'client' | 'client_document') {
    super(reason);
  }
}

const NAME_MAX = 100;
const DOCUMENT_MAX_BYTES = 5 * 1024;
const DOCUMENT_DEADLINE_MS = 5000;
const CACHE_MIN_MS = 5 * 60 * 1000;
const CACHE_MAX_MS = 24 * 60 * 60 * 1000;
/** Apps that registered themselves and never connected, at most. */
export const UNUSED_REGISTRATIONS_MAX = 50;

/** Characters that are not seen: controls, and those that turn text around. */
function invisible(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** What an app calls itself, made safe to show: one short line. */
export function cleanClientName(value: unknown, fallback: string): string {
  const name =
    typeof value === 'string'
      ? [...value]
          .filter((char) => !invisible(char.codePointAt(0)!))
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, NAME_MAX)
      : '';
  return name || fallback;
}

/** An app's home page, kept only when it is an ordinary site's address. */
function cleanClientUri(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > REDIRECT_URI_MAX) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Whether an id is the address of a description: HTTPS, a path of its own,
 * no query, fragment or credentials, written as the address itself is.
 */
export function isClientDocumentId(value: string): boolean {
  if (value.length > 2048 || !value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return (
      url.href === value &&
      url.pathname !== '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function rowToClient(row: {
  clientId: string;
  kind: 'cimd' | 'dcr';
  name: string;
  uri: string | null;
  redirectUris: string[];
}): OAuthClient {
  return {
    clientId: row.clientId,
    kind: row.kind,
    name: row.name,
    uri: row.uri,
    redirectUris: row.redirectUris,
  };
}

/** How long a description may be kept, as its server says, within bounds. */
function cacheLifetime(header: string | null): number {
  const maxAge = /max-age=(\d+)/i.exec(header ?? '')?.[1];
  const ms = maxAge ? Number(maxAge) * 1000 : 0;
  return Math.min(CACHE_MAX_MS, Math.max(CACHE_MIN_MS, ms));
}

const reading = new Map<string, Promise<OAuthClient>>();

/** Reads an app's description from its address, once for every caller. */
function readClientDocument(clientId: string): Promise<OAuthClient> {
  const pending = reading.get(clientId);
  if (pending) return pending;
  const promise = fetchClientDocument(clientId).finally(() =>
    reading.delete(clientId),
  );
  reading.set(clientId, promise);
  return promise;
}

async function fetchClientDocument(clientId: string): Promise<OAuthClient> {
  const now = Date.now();
  let document: Record<string, unknown>;
  let lifetime: number;
  try {
    const response = await fetchGuarded(clientId, {
      accept: 'application/json',
      maxBytes: DOCUMENT_MAX_BYTES,
      deadline: now + DOCUMENT_DEADLINE_MS,
      // The address is the app's identity: it answers itself, or not at all.
      maxRedirects: 0,
    });
    if (!response.ok) throw new OAuthClientError('client_document');
    const parsed = JSON.parse(new TextDecoder().decode(response.bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new OAuthClientError('client_document');
    document = parsed as Record<string, unknown>;
    lifetime = cacheLifetime(response.headers.get('cache-control'));
  } catch {
    throw new OAuthClientError('client_document');
  }
  const redirectUris = document.redirect_uris;
  const method = document.token_endpoint_auth_method;
  if (
    document.client_id !== clientId ||
    // An app in a browser or on a desktop keeps no secret: none is taken.
    'client_secret' in document ||
    (method !== undefined && method !== 'none') ||
    !Array.isArray(redirectUris) ||
    !redirectUris.length ||
    redirectUris.length > 10 ||
    !redirectUris.every(redirectUriAllowed)
  )
    throw new OAuthClientError('client_document');

  const client: OAuthClient = {
    clientId,
    kind: 'cimd',
    name: cleanClientName(document.client_name, new URL(clientId).hostname),
    uri: cleanClientUri(document.client_uri),
    redirectUris: redirectUris as string[],
  };
  const { db, schema } = THEI_SERVER.useDb();
  const values = {
    ...client,
    fetchedAt: now,
    staleAt: now + lifetime,
  };
  db.insert(schema.oauthClients)
    .values({ ...values, createdAt: now })
    .onConflictDoUpdate({ target: schema.oauthClients.clientId, set: values })
    .run();
  return client;
}

/**
 * The app behind an id: read from its description when it is an address and
 * not kept or kept too long, or the one that registered under it.
 */
export async function resolveClient(clientId: unknown): Promise<OAuthClient> {
  if (typeof clientId !== 'string' || !clientId)
    throw new OAuthClientError('client');
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, clientId))
    .get();
  if (isClientDocumentId(clientId)) {
    if (row && (row.staleAt ?? 0) > Date.now()) return rowToClient(row);
    return readClientDocument(clientId);
  }
  if (!row || row.kind !== 'dcr') throw new OAuthClientError('client');
  return rowToClient(row);
}

/** Notes that an app got a connection, for keeping it while it is used. */
export function touchClient(clientId: string, now = Date.now()) {
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.oauthClients)
    .set({ lastUsedAt: now })
    .where(eq(schema.oauthClients.clientId, clientId))
    .run();
}

export type RegistrationResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; description: string };

function refuse(description: string, error = 'invalid_client_metadata') {
  return { ok: false as const, status: 400, error, description };
}

/**
 * An app registering itself (RFC 7591): only what a public client may be —
 * no secret, codes and their renewal, addresses that pass the rules. The
 * registration is not managed afterwards: an app that needs another
 * registers again.
 */
export async function registerClient(
  body: unknown,
): Promise<RegistrationResult> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return refuse('The body is a JSON object.');
  const metadata = body as Record<string, unknown>;
  const redirectUris = metadata.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    !redirectUris.length ||
    redirectUris.length > 10
  )
    return refuse('redirect_uris: from one to ten addresses.');
  if (!redirectUris.every(redirectUriAllowed))
    return refuse(
      'A redirect URI is HTTPS, plain HTTP on this computer only, or an app’s own scheme, with no fragment.',
      'invalid_redirect_uri',
    );
  const method = metadata.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none')
    return refuse('Only public clients: token_endpoint_auth_method "none".');
  const grants = metadata.grant_types;
  if (
    grants !== undefined &&
    (!Array.isArray(grants) ||
      !grants.every(
        (grant) => grant === 'authorization_code' || grant === 'refresh_token',
      ))
  )
    return refuse('grant_types: authorization_code and refresh_token only.');
  const responses = metadata.response_types;
  if (
    responses !== undefined &&
    (!Array.isArray(responses) ||
      !responses.every((response) => response === 'code'))
  )
    return refuse('response_types: code only.');

  const { db, schema } = THEI_SERVER.useDb();
  // Registering costs nothing to an app: those that never connected are
  // held to a number, so registering cannot fill the database.
  const unused =
    db
      .select({ n: count() })
      .from(schema.oauthClients)
      .where(
        and(
          eq(schema.oauthClients.kind, 'dcr'),
          isNull(schema.oauthClients.lastUsedAt),
        ),
      )
      .get()?.n ?? 0;
  if (unused >= UNUSED_REGISTRATIONS_MAX)
    return {
      ok: false,
      status: 429,
      error: 'temporarily_unavailable',
      description: 'Too many apps registered and never connected.',
    };

  const now = Date.now();
  const clientId = `${EntityPrefix.OAuthClient}-${randomUUID()}`;
  const host = (() => {
    try {
      return new URL(redirectUris[0] as string).hostname || 'app';
    } catch {
      return 'app';
    }
  })();
  const client = {
    clientId,
    kind: 'dcr' as const,
    name: cleanClientName(metadata.client_name, host),
    uri: cleanClientUri(metadata.client_uri),
    redirectUris: redirectUris as string[],
  };
  db.insert(schema.oauthClients)
    .values({ ...client, createdAt: now })
    .run();
  return {
    ok: true,
    body: {
      client_id: clientId,
      client_id_issued_at: Math.floor(now / 1000),
      client_name: client.name,
      ...(client.uri ? { client_uri: client.uri } : {}),
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
  };
}

/**
 * Lets go of apps nothing needs: one that registered itself and never
 * connected, after a day; one unused for three months; a kept description
 * no connection uses, after a month. An app with a connection stays.
 */
export function sweepClients(now = Date.now()) {
  const { db, schema } = THEI_SERVER.useDb();
  const connected = new Set(
    db
      .select({ clientId: schema.apiTokens.clientId })
      .from(schema.apiTokens)
      .all()
      .map((row) => row.clientId)
      .filter(Boolean),
  );
  const day = 24 * 60 * 60 * 1000;
  const candidates = db
    .select({ clientId: schema.oauthClients.clientId })
    .from(schema.oauthClients)
    .where(
      or(
        and(
          eq(schema.oauthClients.kind, 'dcr'),
          isNull(schema.oauthClients.lastUsedAt),
          lt(schema.oauthClients.createdAt, now - day),
        ),
        and(
          eq(schema.oauthClients.kind, 'dcr'),
          lt(schema.oauthClients.lastUsedAt, now - 90 * day),
        ),
        and(
          eq(schema.oauthClients.kind, 'cimd'),
          lt(schema.oauthClients.fetchedAt, now - 30 * day),
        ),
      ),
    )
    .all();
  for (const { clientId } of candidates)
    if (!connected.has(clientId))
      db.delete(schema.oauthClients)
        .where(eq(schema.oauthClients.clientId, clientId))
        .run();
}
