import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { E2E_ORIGIN } from './fixture-url';

/**
 * An AI app connecting by signing in, end to end on a production build: it
 * finds the way from a refusal, registers, sends the owner to the consent
 * page, gets its keys and renews them — and the routes under `.well-known`
 * are in the build at all.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const REDIRECT = 'http://localhost:4567/callback';
const VERIFIER = randomBytes(40).toString('base64url');
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

async function setAccess(request: APIRequestContext, enabled: boolean) {
  const response = await request.put('/api/admin/ai/settings', {
    data: { enabled },
  });
  expect(response.ok()).toBe(true);
}

async function register(request: APIRequestContext): Promise<string> {
  const response = await request.post('/oauth/register', {
    data: { client_name: 'E2E App', redirect_uris: [REDIRECT] },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).client_id;
}

function authorizeUrl(clientId: string) {
  const url = new URL('/oauth/authorize', E2E_ORIGIN);
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'e2e-state',
    scope: 'read',
  }))
    url.searchParams.set(key, value);
  return url.href;
}

/** Where the browser was sent back to the app, caught before it leaves. */
async function catchRedirect(page: Page): Promise<() => Promise<URL>> {
  let resolve!: (url: URL) => void;
  const caught = new Promise<URL>((done) => (resolve = done));
  await page.route('http://localhost:4567/**', (route) => {
    resolve(new URL(route.request().url()));
    return route.fulfill({ status: 200, body: 'ok' });
  });
  return () => caught;
}

test.afterAll(async ({ request }) => {
  await setAccess(request, false);
});

test('an app finds the way from a refusal', async ({ request }) => {
  await setAccess(request, true);
  const refused = await request.post('/api/mcp', { data: {} });
  expect(refused.status()).toBe(401);
  const challenge = refused.headers()['www-authenticate'] ?? '';
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  expect(metadataUrl).toBe(
    `${E2E_ORIGIN}/.well-known/oauth-protected-resource/api/mcp`,
  );
  const resource = await (await request.get(metadataUrl!)).json();
  expect(resource.authorization_servers).toEqual([E2E_ORIGIN]);
  const server = await request.get('/.well-known/oauth-authorization-server');
  expect(server.headers()['access-control-allow-origin']).toBe('*');
  expect((await server.json()).token_endpoint).toBe(
    `${E2E_ORIGIN}/oauth/token`,
  );
});

test('the owner allows a connection, and the app works with its keys', async ({
  page,
  request,
}) => {
  const clientId = await register(request);
  const redirected = await catchRedirect(page);
  await page.goto(authorizeUrl(clientId));
  await expect(page).toHaveURL(/\/oauth\/consent\/[\w-]{43}\/$/);
  const consent = page.locator('[data-oauth-consent]');
  await expect(consent).toHaveAttribute('data-state', 'ready');
  await expect(consent).toContainText('E2E App');
  // Never framed, never kept.
  const response = await page.request.get(page.url());
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['cache-control']).toContain('no-store');

  await page.locator('[data-oauth-allow]').click();
  const back = await redirected();
  expect(back.searchParams.get('state')).toBe('e2e-state');
  expect(back.searchParams.get('iss')).toBe(E2E_ORIGIN);

  const exchange = await request.post('/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      code: back.searchParams.get('code')!,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    },
  });
  expect(exchange.status()).toBe(200);
  const keys = await exchange.json();
  expect(keys.scope).toBe('read');

  const tools = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${keys.access_token}`,
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/list',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'e2e', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    },
  });
  expect(tools.status()).toBe(200);
  const names = (await tools.json()).result.tools.map(
    (tool: { name: string }) => tool.name,
  );
  // A reader: nothing that writes.
  expect(names).toContain('read_entity');
  expect(names).not.toContain('update_entity');

  const renewed = await request.post('/oauth/token', {
    form: {
      grant_type: 'refresh_token',
      refresh_token: keys.refresh_token,
      client_id: clientId,
    },
  });
  expect(renewed.status()).toBe(200);
  const stale = await request.post('/api/mcp', {
    headers: { authorization: `Bearer ${keys.access_token}` },
    data: {},
  });
  expect(stale.status()).toBe(401);

  // The connection is listed with the keys, under the app it belongs to.
  const listed = await (await request.get('/api/admin/api-tokens')).json();
  expect(
    listed.tokens.find(
      (token: { kind: string; client?: { name: string } }) =>
        token.kind === 'oauth' && token.client?.name === 'E2E App',
    ),
  ).toBeTruthy();
});

test('declining tells the app so', async ({ page, request }) => {
  const clientId = await register(request);
  const redirected = await catchRedirect(page);
  await page.goto(authorizeUrl(clientId));
  await expect(page.locator('[data-oauth-consent]')).toHaveAttribute(
    'data-state',
    'ready',
  );
  await page.locator('[data-oauth-deny]').click();
  expect((await redirected()).searchParams.get('error')).toBe('access_denied');
});

test('a browser without a session is sent to sign in, and back', async ({
  browser,
  request,
}) => {
  const clientId = await register(request);
  const stranger = await browser.newContext({ storageState: undefined });
  const page = await stranger.newPage();
  await page.goto(authorizeUrl(clientId));
  const consent = page.locator('[data-oauth-consent]');
  await expect(consent).toHaveAttribute('data-state', 'sign-in');
  const signIn = consent.getByRole('link');
  await expect(signIn).toHaveAttribute(
    'href',
    /\/sign-in\/\?next=%2Foauth%2Fconsent%2F[\w-]{43}%2F$/,
  );
  await stranger.close();
});

test('an unknown app is refused without a word to it', async ({ page }) => {
  await page.goto(authorizeUrl('oc-unknown'));
  await expect(page).toHaveURL(/\/oauth\/refused\/\?reason=client$/);
  await expect(page.locator('[data-oauth-refused]')).toBeVisible();
});

test('off, there is nothing to sign in at', async ({ request }) => {
  await setAccess(request, false);
  expect(
    (await request.get('/.well-known/oauth-authorization-server')).status(),
  ).toBe(404);
  expect(
    (
      await request.post('/oauth/token', { form: { grant_type: 'x' } })
    ).status(),
  ).toBe(404);
});
