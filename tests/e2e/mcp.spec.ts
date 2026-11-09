import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * AI access over MCP, end to end on a production build: the switch, the
 * tokens, and a client of either protocol era reading the site. It also
 * proves the SDK and the Markdown packages are traced into the build.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'e2e', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function setAccess(request: APIRequestContext, enabled: boolean) {
  const response = await request.put('/api/admin/ai/settings', {
    data: { enabled },
  });
  expect(response.ok()).toBe(true);
}

async function revokeAll(request: APIRequestContext) {
  const { tokens } = await (await request.get('/api/admin/api-tokens')).json();
  for (const token of tokens)
    await request.delete(`/api/admin/api-tokens/${token.tokenUuid}`);
}

function mcp(
  request: APIRequestContext,
  token: string | undefined,
  method: string,
  params: Record<string, unknown> = {},
) {
  return request.post('/api/mcp', {
    headers: {
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
      ...(typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    data: { jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: META } },
  });
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

test.afterAll(async ({ request }) => {
  await revokeAll(request);
  await setAccess(request, false);
});

test('switched off, there is no MCP endpoint at all', async ({ request }) => {
  await setAccess(request, false);
  const { token } = await (
    await request.post('/api/admin/api-tokens', {
      data: { label: 'Off', preset: 'reader' },
    })
  ).json();
  expect((await mcp(request, token, 'tools/list')).status()).toBe(404);
});

test('switched on, a token reads the site and a revoked one does not', async ({
  request,
}) => {
  await setAccess(request, true);
  expect((await mcp(request, undefined, 'tools/list')).status()).toBe(401);

  const created = await request.post('/api/admin/api-tokens', {
    data: { label: 'E2E', preset: 'reader' },
  });
  const { token, item } = await created.json();

  const listed = await (await mcp(request, token, 'tools/list')).json();
  expect(
    listed.result.tools.map((tool: { name: string }) => tool.name),
  ).toContain('read_entity');

  const overview = await (
    await mcp(request, token, 'tools/call', {
      name: 'site_overview',
      arguments: {},
    })
  ).json();
  expect(overview.result.content[0].text).toContain('Your access key: “E2E”');
  expect(overview.result.content[0].text).toContain('# How texts are written');

  // A client of the 2025 protocol starts with a handshake instead.
  const handshake = await request.post('/api/mcp', {
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'old', version: '1' },
      },
    },
  });
  expect(await handshake.text()).toContain('"protocolVersion":"2025-06-18"');

  await request.delete(`/api/admin/api-tokens/${item.tokenUuid}`);
  // A revoked token is a wrong one: refused, or slowed down for a moment
  // after the tokenless call above.
  expect([401, 429]).toContain(
    (await mcp(request, token, 'tools/list')).status(),
  );
});

test('the AI page turns access on and issues an access key once', async ({
  page,
  request,
}) => {
  await revokeAll(request);
  await setAccess(request, false);
  await open(page, '/admin/ai/?tab=connection');

  const toggle = page.getByRole('switch', { name: 'AI in Thei' });
  // Phrases bind short words with non-breaking spaces, which `\s` matches.
  await expect(
    page.getByText(/^Off:\s+no\s+app\s+can\s+connect/),
  ).toBeVisible();
  await toggle.click();
  await expect(page.getByText(/^On:\s+AI\s+apps\s+connect/)).toBeVisible();

  await page
    .getByRole('button', { name: /Create\s+a\s+key/, expanded: false })
    .click();
  await page
    .getByPlaceholder(/Claude\s+Code\s+on\s+the\s+laptop/)
    .fill('From the page');
  await page
    .locator('form')
    .getByRole('button', { name: /Create\s+a\s+key/ })
    .click();

  const token = page.locator('code', { hasText: /^thei_/ });
  await expect(token).toBeVisible();
  await expect(page.getByText('From the page')).toBeVisible();
  // With the header an app sends it in, to copy.
  await expect(page.locator('[data-api-token-header]')).toContainText(
    'Authorization: Bearer thei_',
  );

  // Shown once: read again, the page lists the token but no longer holds it.
  await open(page, '/admin/ai/?tab=connection');
  await expect(page.getByText('From the page')).toBeVisible();
  await expect(page.locator('code', { hasText: /^thei_/ })).toHaveCount(0);
});

/** A project of the spec's own, made as the owner makes one. */
async function makeProject(request: APIRequestContext, title: string) {
  const stamp = Date.now() % 1_000_000;
  const body = await (
    await request.post('/api/admin/projects', {
      data: {
        title: `${title} ${stamp}`,
        summary: 'Before',
        access: 'public',
        humanReadableSlug: 'mcp-spec',
        publicId: `mcp${stamp}`,
        showcase: false,
        cv: false,
        descriptionContent: {
          data: { blocks: [{ type: 'paragraph', data: { text: 'Text.' } }] },
        },
        relations: [],
      },
    })
  ).json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body.projectUuid as string;
}

/** Calls a tool as the key given; its answer as text. */
async function callTool(
  request: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown>,
) {
  const answer = (await (
    await mcp(request, token, 'tools/call', { name, arguments: args })
  ).json()) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  return {
    text: answer.result.content.map((part) => part.text).join('\n'),
    isError: Boolean(answer.result.isError),
  };
}

const summaryOf = async (request: APIRequestContext, projectUuid: string) =>
  (await (await request.get(`/api/admin/projects/${projectUuid}`)).json())
    .summary as string;

test('a form opened before an AI change does not write over it', async ({
  page,
  request,
}) => {
  await setAccess(request, true);
  const { token } = await (
    await request.post('/api/admin/api-tokens', {
      data: { label: 'Editor', preset: 'editor' },
    })
  ).json();
  const projectUuid = await makeProject(request, 'Race');
  await open(page, `/admin/projects/${projectUuid}/edit/`);

  // An editor's key applies at once, as the owner would.
  const changed = await callTool(request, token, 'apply_actions', {
    actions: [
      {
        kind: 'field',
        target: `project:${projectUuid}`,
        field: 'summary',
        value: 'Changed by AI',
      },
    ],
  });
  expect(changed.isError, changed.text).toBe(false);
  expect(changed.text).toMatch(/^Applied 1: project:/);

  // The form still holds the old summary; saving it would undo the change.
  await page.getByPlaceholder(/Find\s+the\s+photos/).fill('Look again');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByText(/changed\s+since\s+the\s+form\s+was\s+opened/),
  ).toBeVisible();

  // Read again, the form holds the change and saves over it.
  await open(page, `/admin/projects/${projectUuid}/edit/`);
  // The summary is the form's first text area.
  await expect(page.locator('textarea').first()).toHaveValue('Changed by AI');
  await page.getByPlaceholder(/Find\s+the\s+photos/).fill('Look again');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Saved', exact: true }),
  ).toBeVisible();
  await request.delete(`/api/admin/projects/${projectUuid}`);
});

test('an editor key changes the archive as the owner, and leaves no trace of it', async ({
  page,
  request,
}) => {
  await setAccess(request, true);
  const { token } = await (
    await request.post('/api/admin/api-tokens', {
      data: { label: 'Direct', preset: 'editor' },
    })
  ).json();
  const projectUuid = await makeProject(request, 'Direct');
  const before = await (await request.get('/api/admin/ai/sessions')).json();
  const applied = await callTool(request, token, 'apply_actions', {
    actions: [
      {
        kind: 'field',
        target: `project:${projectUuid}`,
        field: 'summary',
        value: 'After',
      },
    ],
  });
  expect(applied.isError, applied.text).toBe(false);
  expect(await summaryOf(request, projectUuid)).toBe('After');

  // No session, nothing waiting: the work lives in the app's conversation.
  const after = await (await request.get('/api/admin/ai/sessions')).json();
  expect(after.sessions).toEqual(before.sessions);
  expect(after.waiting).toBe(before.waiting);
  // Its form reads as the owner's own save left it, with nothing proposed.
  await open(page, `/admin/projects/${projectUuid}/edit/`);
  await expect(page.locator('textarea').first()).toHaveValue('After');
  await expect(page.locator('[data-ai-offer]')).toHaveCount(0);
  await request.delete(`/api/admin/projects/${projectUuid}`);
});

test('a reader key only reads', async ({ request }) => {
  await setAccess(request, true);
  const { token } = await (
    await request.post('/api/admin/api-tokens', {
      data: { label: 'Reader', preset: 'reader' },
    })
  ).json();
  const listed = await (await mcp(request, token, 'tools/list')).json();
  const names = listed.result.tools.map((tool: { name: string }) => tool.name);
  expect(names).toContain('read_entity');
  for (const name of ['apply_actions', 'propose', 'upload_file'])
    expect(names).not.toContain(name);
});
