import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAUTH_REFRESH_GRACE_MS, signInReturnPath } from '../../shared/oauth';
import { freshAiTestDb } from '../helpers/fresh-ai-db';

vi.mock('../../server/thei/external-links/fetch', () => ({
  fetchGuarded: vi.fn(),
}));

import { fetchGuarded } from '../../server/thei/external-links/fetch';
import { authenticateMcpRequest } from '../../server/thei/api-tokens';
import { startAuthorization } from '../../server/thei/oauth/authorize';
import { mcpResource, oauthAvailable } from '../../server/thei/oauth/base';
import { registerClient, resolveClient } from '../../server/thei/oauth/clients';
import { decideRequest, readRequest } from '../../server/thei/oauth/consent';
import {
  pruneOAuthLimits,
  registerLimit,
} from '../../server/thei/oauth/limits';
import { sweepOAuth } from '../../server/thei/oauth/maintenance';
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from '../../server/thei/oauth/metadata';
import {
  exchangeCode,
  renewKeys,
  revokeKey,
} from '../../server/thei/oauth/tokens';

/**
 * An AI app connecting by signing in: what it reads to find the way, what
 * it may ask, what the owner's answer gives it, and that every key it holds
 * opens exactly what was granted, for exactly as long — and that nothing
 * along the way can be turned to sending a browser or a key elsewhere.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;
let baseURL = '/';

const event = {
  node: { req: { headers: {}, socket: { remoteAddress: '10.0.0.1' } } },
  context: {},
} as never;

beforeEach(async () => {
  baseURL = '/';
  context = await freshAiTestDb();
  // A test may move the site into a folder.
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ app: { baseURL } }),
  });
  vi.mocked(fetchGuarded).mockReset();
  // Every test with the limits of an hour from now: none spent.
  pruneOAuthLimits(Date.now() + 2 * 60 * 60 * 1000);
});

afterEach(async () => {
  await context.close();
});

const REDIRECT = 'http://127.0.0.1:4567/callback';
const VERIFIER = 'v'.repeat(50);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

async function registered(redirectUris = [REDIRECT]) {
  const result = await registerClient({
    client_name: 'Test App',
    redirect_uris: redirectUris,
  });
  if (result.status !== 201) throw new Error(JSON.stringify(result.body));
  return result.body.client_id as string;
}

function authorizeQuery(clientId: string, extra: Record<string, unknown> = {}) {
  return {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'read edit',
    resource: 'https://example.test/api/mcp',
    ...extra,
  };
}

/** A request asked for and allowed: the code the app gets back. */
async function allowed(
  clientId: string,
  preset: 'reader' | 'editor' = 'reader',
) {
  const outcome = await startAuthorization(
    authorizeQuery(clientId),
    event,
    '10.0.0.1',
  );
  if (outcome.type !== 'consent') throw new Error(JSON.stringify(outcome));
  const decided = decideRequest(
    outcome.requestId,
    { allow: true, preset, label: 'Laptop' },
    event,
  );
  if (decided.type !== 'redirect') throw new Error(decided.type);
  const url = new URL(decided.url);
  return url.searchParams.get('code')!;
}

async function connected(clientId?: string) {
  const id = clientId ?? (await registered());
  const code = await allowed(id);
  const answer = exchangeCode(
    {
      code,
      client_id: id,
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
      resource: 'https://example.test/api/mcp',
    },
    'https://example.test/api/mcp',
  );
  expect(answer.status).toBe(200);
  return { clientId: id, ...(answer.body as Record<string, string>) };
}

function bearer(token: string) {
  return {
    node: { req: { headers: { authorization: `Bearer ${token}` } } },
    context: {},
  } as never;
}

describe('finding the way', () => {
  it('names the site as the server an app signs in at', () => {
    expect(protectedResourceMetadata(event)).toMatchObject({
      resource: 'https://example.test/api/mcp',
      authorization_servers: ['https://example.test'],
      scopes_supported: ['read', 'edit'],
    });
    const server = authorizationServerMetadata(event);
    expect(server).toMatchObject({
      issuer: 'https://example.test',
      authorization_endpoint: 'https://example.test/oauth/authorize',
      token_endpoint: 'https://example.test/oauth/token',
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
    });
  });

  it('keeps a site in a subfolder in every address', () => {
    baseURL = '/diary/';
    expect(authorizationServerMetadata(event).issuer).toBe(
      'https://example.test/diary',
    );
    expect(mcpResource(event)).toBe('https://example.test/diary/api/mcp');
  });

  it('is there only with AI on, and over HTTPS but on this computer', () => {
    expect(oauthAvailable(event)).toBe(true);
    Object.assign(context.server.config, { siteUrl: 'http://example.test' });
    expect(oauthAvailable(event)).toBe(false);
    Object.assign(context.server.config, { siteUrl: 'http://localhost:3000' });
    expect(oauthAvailable(event)).toBe(true);
    context.server.config.mcp.enabled = false;
    expect(oauthAvailable(event)).toBe(false);
  });

  it('leads back from signing in only to a waiting request', () => {
    const id = 'a'.repeat(43);
    expect(signInReturnPath(`/oauth/consent/${id}/`)).toBe(
      `/oauth/consent/${id}/`,
    );
    expect(signInReturnPath('https://evil.test/')).toBeUndefined();
    expect(signInReturnPath('//evil.test/')).toBeUndefined();
    expect(signInReturnPath('/admin/')).toBeUndefined();
  });
});

describe('an app registering itself', () => {
  it('may come back only to an address that is its own', async () => {
    for (const uri of [
      'http://example.com/callback',
      'javascript:alert(1)',
      'https://app.test/cb#fragment',
      'https://user:pass@app.test/cb',
    ])
      expect((await registerClient({ redirect_uris: [uri] })).status).toBe(400);
    for (const uri of [
      'https://app.test/cb',
      'http://localhost:33418/callback',
      'com.example.app:/oauth',
    ])
      expect((await registerClient({ redirect_uris: [uri] })).status).toBe(201);
    expect(
      await registerClient({
        redirect_uris: ['https://app.test/cb'],
        token_endpoint_auth_method: 'client_secret_basic',
      }),
    ).toMatchObject({
      status: 400,
      body: { error: 'invalid_client_metadata' },
    });
  });

  it('is held to a number while it never connects, the oldest let go', async () => {
    const keys = await connected();
    const first = await registered();
    for (let index = 0; index < 50; index++) await registered();
    // A stranger registering without end closes the way for no one.
    expect((await registerClient({ redirect_uris: [REDIRECT] })).status).toBe(
      201,
    );
    const unused = context.rawDb
      .prepare(
        "SELECT clientId FROM `oauth-clients` WHERE kind = 'dcr' AND lastUsedAt IS NULL",
      )
      .all() as { clientId: string }[];
    expect(unused).toHaveLength(50);
    expect(unused.map((row) => row.clientId)).not.toContain(first);
    // An app that connected is no stranger, however many come after.
    expect(
      context.rawDb
        .prepare('SELECT clientId FROM `oauth-clients` WHERE clientId = ?')
        .get(keys.clientId),
    ).toBeTruthy();
  });
});

describe('asking for a connection', () => {
  it('sends nothing to an address it cannot trust', async () => {
    expect(
      await startAuthorization(authorizeQuery('oc-nope'), event, 'ip'),
    ).toEqual({ type: 'refused', reason: 'client' });
    const id = await registered();
    expect(
      await startAuthorization(
        authorizeQuery(id, { redirect_uri: 'https://evil.test/cb' }),
        event,
        'ip',
      ),
    ).toEqual({ type: 'refused', reason: 'redirect_uri' });
    expect(
      await startAuthorization(
        authorizeQuery(id, { state: ['a', 'b'] }),
        event,
        'ip',
      ),
    ).toEqual({ type: 'refused', reason: 'request' });
  });

  it('tells the app what is wrong once it is known', async () => {
    const id = await registered();
    const noPkce = await startAuthorization(
      authorizeQuery(id, { code_challenge_method: 'plain' }),
      event,
      'ip',
    );
    expect(noPkce.type).toBe('redirect');
    const url = new URL((noPkce as { url: string }).url);
    expect(url.searchParams.get('error')).toBe('invalid_request');
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('iss')).toBe('https://example.test');
    const elsewhere = await startAuthorization(
      authorizeQuery(id, { resource: 'https://other.test/api/mcp' }),
      event,
      'ip',
    );
    expect(
      new URL((elsewhere as { url: string }).url).searchParams.get('error'),
    ).toBe('invalid_target');
  });

  it('lets a program on this computer come back on any port', async () => {
    const id = await registered();
    const outcome = await startAuthorization(
      authorizeQuery(id, { redirect_uri: 'http://127.0.0.1:9999/callback' }),
      event,
      'ip',
    );
    expect(outcome.type).toBe('consent');
  });

  it('shows the owner who asks, and what a self-named app may be', async () => {
    const id = await registered();
    const outcome = await startAuthorization(authorizeQuery(id), event, 'ip');
    const view = readRequest((outcome as { requestId: string }).requestId)!;
    expect(view).toMatchObject({
      client: { name: 'Test App', kind: 'dcr' },
      redirect: { kind: 'loopback', port: '4567' },
      requested: ['read', 'edit'],
      connections: 0,
      limitReached: false,
    });
  });

  it('counts a request before it reads the app from its address', async () => {
    vi.mocked(fetchGuarded).mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      url: '',
      bytes: new Uint8Array(),
    });
    const ask = (index: number) =>
      startAuthorization(
        authorizeQuery(`https://app${index}.test/client.json`),
        event,
        'flood',
      );
    for (let index = 0; index < 30; index++)
      expect(await ask(index)).toEqual({
        type: 'refused',
        reason: 'client_document',
      });
    expect(fetchGuarded).toHaveBeenCalledTimes(30);
    // Past its allowance, an address makes the site read nothing more.
    expect(await ask(30)).toEqual({ type: 'busy' });
    expect(fetchGuarded).toHaveBeenCalledTimes(30);
    expect(
      (
        await startAuthorization(
          authorizeQuery(await registered()),
          event,
          'ip',
        )
      ).type,
    ).toBe('consent');
  });

  it('makes room for a new request rather than turning it away', async () => {
    const id = await registered();
    const requests: string[] = [];
    for (let index = 0; index <= 50; index++) {
      const outcome = await startAuthorization(
        authorizeQuery(id),
        event,
        `10.1.0.${index}`,
      );
      expect(outcome.type).toBe('consent');
      requests.push((outcome as { requestId: string }).requestId);
    }
    expect(readRequest(requests[0]!)).toBeUndefined();
    expect(readRequest(requests[50]!)).toBeDefined();
    expect(
      context.rawDb
        .prepare('SELECT COUNT(*) AS n FROM `oauth-authorizations`')
        .get(),
    ).toEqual({ n: 50 });
  });

  it('counts only so many addresses, however many come', () => {
    for (let index = 0; index < 10; index++) registerLimit.take('first');
    expect(registerLimit.exceeded('first')).toBe(true);
    for (let index = 0; index < 10_000; index++)
      registerLimit.take(`address-${index}`);
    // The window does not grow past its bound: the one counted longest ago
    // is let go to make room.
    expect(registerLimit.exceeded('first')).toBe(false);
  });

  it('tells the app when the owner declines', async () => {
    const id = await registered();
    const outcome = await startAuthorization(authorizeQuery(id), event, 'ip');
    const requestId = (outcome as { requestId: string }).requestId;
    const declined = decideRequest(requestId, { allow: false }, event);
    expect(
      new URL((declined as { url: string }).url).searchParams.get('error'),
    ).toBe('access_denied');
    // Answered once: the request is gone.
    expect(readRequest(requestId)).toBeUndefined();
    expect(decideRequest(requestId, { allow: true }, event)).toEqual({
      type: 'gone',
    });
  });
});

describe('the keys of a connection', () => {
  it('open the MCP endpoint with the rights the owner gave', async () => {
    const keys = await connected();
    expect(keys.scope).toBe('read');
    expect(keys.access_token).toMatch(/^thei_at_/);
    const auth = authenticateMcpRequest(
      bearer(keys.access_token),
      'https://example.test/api/mcp',
    );
    expect(auth).toMatchObject({
      principal: { scopes: ['read'], label: 'Laptop' },
    });
    // Issued for this endpoint, and for an hour.
    expect(
      authenticateMcpRequest(
        bearer(keys.access_token),
        'https://other.test/api/mcp',
      ),
    ).toEqual({ refused: 'audience' });
    expect(
      authenticateMcpRequest(
        bearer(keys.access_token),
        'https://example.test/api/mcp',
        Date.now() + 61 * 60 * 1000,
      ),
    ).toEqual({ refused: 'expired' });
  });

  it('are given for a code once, and a code used twice takes them back', async () => {
    const clientId = await registered();
    const code = await allowed(clientId, 'editor');
    const params = {
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    };
    expect(
      exchangeCode(
        { ...params, code_verifier: 'w'.repeat(50) },
        'https://example.test/api/mcp',
      ).body.error,
    ).toBe('invalid_grant');
    const first = exchangeCode(params, 'https://example.test/api/mcp');
    expect(first.status).toBe(200);
    expect(first.body.scope).toBe('read edit');
    const again = exchangeCode(params, 'https://example.test/api/mcp');
    expect(again.body.error).toBe('invalid_grant');
    expect(
      authenticateMcpRequest(bearer(first.body.access_token as string)),
    ).toEqual({ refused: 'unknown' });
  });

  it('are renewed both at once, the old access key dead at once', async () => {
    const keys = await connected();
    const before = context.rawDb
      .prepare('SELECT tokenUuid FROM `api-tokens`')
      .get() as { tokenUuid: string };
    const renewed = renewKeys(
      { refresh_token: keys.refresh_token, client_id: keys.clientId },
      'https://example.test/api/mcp',
    );
    expect(renewed.status).toBe(200);
    expect(authenticateMcpRequest(bearer(keys.access_token))).toEqual({
      refused: 'unknown',
    });
    expect(
      authenticateMcpRequest(bearer(renewed.body.access_token as string)),
    ).toHaveProperty('principal.tokenUuid', before.tokenUuid);
  });

  it('forgive a race of two renewals, and end at a stolen refresh key', async () => {
    const keys = await connected();
    const now = Date.now();
    const params = {
      refresh_token: keys.refresh_token,
      client_id: keys.clientId,
    };
    expect(renewKeys(params, 'https://example.test/api/mcp', now).status).toBe(
      200,
    );
    // A second worker with the same key, a moment later: refused, nothing lost.
    expect(
      renewKeys(params, 'https://example.test/api/mcp', now + 1000).body.error,
    ).toBe('invalid_grant');
    expect(
      context.rawDb.prepare('SELECT COUNT(*) AS n FROM `api-tokens`').get(),
    ).toEqual({ n: 1 });
    // Much later, the same old key is someone else's copy: the connection ends.
    renewKeys(
      params,
      'https://example.test/api/mcp',
      now + OAUTH_REFRESH_GRACE_MS + 1000,
    );
    expect(
      context.rawDb.prepare('SELECT COUNT(*) AS n FROM `api-tokens`').get(),
    ).toEqual({ n: 0 });
  });

  it('end when the app revokes either of them', async () => {
    const keys = await connected();
    revokeKey({ token: keys.refresh_token, client_id: 'oc-someone-else' });
    expect(
      context.rawDb.prepare('SELECT COUNT(*) AS n FROM `api-tokens`').get(),
    ).toEqual({ n: 1 });
    revokeKey({ token: keys.refresh_token, client_id: keys.clientId });
    expect(
      context.rawDb.prepare('SELECT COUNT(*) AS n FROM `api-tokens`').get(),
    ).toEqual({ n: 0 });
  });
});

describe('an app known by its own description', () => {
  const ID = 'https://app.test/oauth/client.json';
  const respond = (document: Record<string, unknown>, ok = true) =>
    vi.mocked(fetchGuarded).mockResolvedValueOnce({
      ok,
      status: ok ? 200 : 404,
      headers: new Headers({ 'cache-control': 'max-age=3600' }),
      url: ID,
      bytes: new TextEncoder().encode(JSON.stringify(document)),
    });

  it('is read once, checked, and kept for as long as it says', async () => {
    respond({
      client_id: ID,
      client_name: 'Desc App',
      redirect_uris: [REDIRECT],
    });
    expect(await resolveClient(ID)).toMatchObject({
      kind: 'cimd',
      name: 'Desc App',
    });
    expect(await resolveClient(ID)).toMatchObject({ name: 'Desc App' });
    expect(fetchGuarded).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchGuarded).mock.calls[0]![1]).toMatchObject({
      maxRedirects: 0,
    });
  });

  it('is refused when it does not describe itself, or keeps a secret', async () => {
    const other = 'https://app.test/oauth/other.json';
    vi.mocked(fetchGuarded).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      url: other,
      bytes: new TextEncoder().encode(
        JSON.stringify({ client_id: ID, redirect_uris: [REDIRECT] }),
      ),
    });
    await expect(resolveClient(other)).rejects.toMatchObject({
      reason: 'client_document',
    });
    const secret = 'https://app.test/oauth/secret.json';
    vi.mocked(fetchGuarded).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      url: secret,
      bytes: new TextEncoder().encode(
        JSON.stringify({
          client_id: secret,
          client_secret: 'x',
          redirect_uris: [REDIRECT],
        }),
      ),
    });
    await expect(resolveClient(secret)).rejects.toMatchObject({
      reason: 'client_document',
    });
  });

  it('is kept only so many times while it never connects', async () => {
    const ids = Array.from(
      { length: 51 },
      (_, index) => `https://app.test/oauth/${index}.json`,
    );
    for (const id of ids) {
      respond({
        client_id: id,
        client_name: 'Many',
        redirect_uris: [REDIRECT],
      });
      await resolveClient(id);
    }
    const kept = (
      context.rawDb
        .prepare("SELECT clientId FROM `oauth-clients` WHERE kind = 'cimd'")
        .all() as { clientId: string }[]
    ).map((row) => row.clientId);
    expect(kept).toHaveLength(50);
    expect(kept).not.toContain(ids[0]);
  });

  it('is read only so many times an hour, whoever asks', async () => {
    vi.mocked(fetchGuarded).mockRejectedValue(new Error('down'));
    for (let index = 0; index < 100; index++)
      await expect(
        resolveClient(`https://app.test/oauth/down-${index}.json`),
      ).rejects.toMatchObject({ reason: 'client_document' });
    await expect(
      resolveClient('https://app.test/oauth/one-more.json'),
    ).rejects.toMatchObject({ reason: 'client_document' });
    expect(fetchGuarded).toHaveBeenCalledTimes(100);
  });

  it('is shown as known by its address', async () => {
    respond({
      client_id: ID,
      client_name: 'Desc App',
      redirect_uris: [REDIRECT],
    });
    const outcome = await startAuthorization(authorizeQuery(ID), event, 'ip');
    const view = readRequest((outcome as { requestId: string }).requestId);
    expect(view?.client).toMatchObject({ kind: 'cimd', host: 'app.test' });
  });
});

describe('the sweep', () => {
  it('lets go of what is past its time, and keeps an app that is connected', async () => {
    const keys = await connected();
    const lonely = await registered();
    const day = 24 * 60 * 60 * 1000;
    const later = Date.now() + 2 * day;
    sweepOAuth(later);
    const clients = (
      context.rawDb.prepare('SELECT clientId FROM `oauth-clients`').all() as {
        clientId: string;
      }[]
    ).map((row) => row.clientId);
    expect(clients).toContain(keys.clientId);
    expect(clients).not.toContain(lonely);
    expect(
      context.rawDb
        .prepare('SELECT COUNT(*) AS n FROM `oauth-authorizations`')
        .get(),
    ).toEqual({ n: 0 });
    // A connection nothing renewed for a month ends.
    sweepOAuth(Date.now() + 31 * day);
    expect(
      context.rawDb.prepare('SELECT COUNT(*) AS n FROM `api-tokens`').get(),
    ).toEqual({ n: 0 });
  });
});
