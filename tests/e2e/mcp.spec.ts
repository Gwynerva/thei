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
  expect(overview.result.content[0].text).toContain('Your token: “E2E”');
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
  await expect(
    page.getByText(/claude mcp add --transport http thei/),
  ).toBeVisible();

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

  // An editor's key proposes and applies at once, as the owner would.
  const changed = await callTool(request, token, 'propose', {
    actions: [
      {
        kind: 'field',
        target: `project:${projectUuid}`,
        field: 'summary',
        value: 'Changed by AI',
        reason: 'Clearer',
      },
    ],
    apply: true,
  });
  expect(changed.isError, changed.text).toBe(false);
  expect(changed.text).toMatch(/Applied: aia-/);

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

test('what an editor key applied is undone from its session', async ({
  page,
  request,
}) => {
  await setAccess(request, true);
  const { token } = await (
    await request.post('/api/admin/api-tokens', {
      data: { label: 'Undoable', preset: 'editor' },
    })
  ).json();
  const projectUuid = await makeProject(request, 'Undo me');
  const applied = await callTool(request, token, 'propose', {
    actions: [
      {
        kind: 'field',
        target: `project:${projectUuid}`,
        field: 'summary',
        value: 'After',
        reason: 'Shorter',
      },
    ],
    apply: true,
  });
  expect(applied.isError, applied.text).toBe(false);
  const sessionUuid = applied.text.match(/In session (ais-[\w-]+)/)![1]!;
  const actionUuid = applied.text.match(/Applied: (aia-[\w-]+)/)![1]!;
  expect(await summaryOf(request, projectUuid)).toBe('After');

  // The owner finds it in the app's session, applied, and takes it back.
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  const row = page.locator(`[data-action="${actionUuid}"]`);
  await expect(row).toHaveAttribute('data-action-state', 'applied');
  await expect(page.locator('[data-session-app-note]')).toBeVisible();
  await expect(page.locator('[data-composer]')).toHaveCount(0);
  await row.locator('[data-action-undo]').click();
  await expect(row).toHaveAttribute('data-action-state', 'undone');
  expect(await summaryOf(request, projectUuid)).toBe('Before');

  // The app reads what became of it.
  const read = await callTool(request, token, 'session_actions', {
    session: sessionUuid,
  });
  expect(read.text).toMatch(new RegExp(`${actionUuid}.*undone`));
  await request.delete(`/api/admin/projects/${projectUuid}`);
});

test('a reader key only proposes, and the owner applies it', async ({
  page,
  request,
}) => {
  await setAccess(request, true);
  const { token } = await (
    await request.post('/api/admin/api-tokens', {
      data: { label: 'Reader', preset: 'reader' },
    })
  ).json();
  const projectUuid = await makeProject(request, 'Proposed to');
  const proposed = await callTool(request, token, 'propose', {
    actions: [
      {
        kind: 'field',
        target: `project:${projectUuid}`,
        field: 'summary',
        value: 'Proposed',
        reason: 'Says what it is',
      },
    ],
    // A reader's key has no apply: the word is not even heard.
    apply: true,
  });
  expect(proposed.isError, proposed.text).toBe(false);
  expect(proposed.text).not.toMatch(/Applied:/);
  const sessionUuid = proposed.text.match(/In session (ais-[\w-]+)/)![1]!;
  const actionUuid = proposed.text.match(/- (aia-[\w-]+): proposed/)![1]!;
  expect(await summaryOf(request, projectUuid)).toBe('Before');

  await open(page, `/admin/ai/?session=${sessionUuid}`);
  const row = page.locator(`[data-action="${actionUuid}"]`);
  await expect(row).toHaveAttribute('data-action-state', 'pending');
  await row.locator('[data-action-apply]').click();
  await expect(row).toHaveAttribute('data-action-state', 'applied');
  expect(await summaryOf(request, projectUuid)).toBe('Proposed');
  await request.delete(`/api/admin/projects/${projectUuid}`);
});
