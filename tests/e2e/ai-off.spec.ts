import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * With AI off, the admin works as if AI were not there: no page, form or
 * widget asks anything about it, nothing about it shows but the way to the
 * switch, and what would change it answers as if it did not exist.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

/**
 * What a page asks only while AI is on: its sessions and their actions, an
 * entity's memory and proposals, a text's edits, the memory and templates.
 * The Connection tab may read the model's settings, which are set before AI
 * is turned on.
 */
const ASKS_ABOUT_AI =
  /\/api\/admin\/ai\/(sessions|actions|entities|texts|memory|templates|terms)\b/;

async function setAccess(request: APIRequestContext, enabled: boolean) {
  const response = await request.put('/api/admin/ai/settings', {
    data: { enabled },
  });
  expect(response.ok()).toBe(true);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await page.waitForLoadState('networkidle');
}

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

/** The forms the test opens, one of each kind it made. */
const forms: string[] = [];

async function made(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body;
}

/**
 * One entity of each kind: the fixture holds pages, and the other specs make
 * the rest for themselves. A diary day and a tag title are each one of a
 * kind, so a run makes its own, and the spec can run again on the same
 * database.
 */
test.beforeAll(async ({ request }) => {
  const run = Date.now() % 100_000;
  const taken = new Set(
    (
      (await (await request.get('/api/admin/diary/dates')).json()) as {
        date: string;
      }[]
    ).map((entry) => entry.date),
  );
  let day = Date.UTC(2013, 0, 1);
  while (taken.has(new Date(day).toISOString().slice(0, 10))) day += 86_400_000;
  const date = new Date(day).toISOString().slice(0, 10);

  const project = await made(
    await request.post('/api/admin/projects', {
      data: {
        title: `Quiet ${run}`,
        summary: 'Nothing to see.',
        access: 'public',
        humanReadableSlug: 'quiet',
        publicId: `quiet${run}`,
        showcase: false,
        cv: false,
        descriptionContent: content('Nothing here.'),
        relations: [],
      },
    }),
  );
  const event = await made(
    await request.post('/api/admin/events', {
      data: {
        title: `Quiet day ${run}`,
        summary: 'Nothing happened.',
        access: 'public',
        humanReadableSlug: 'quiet-day',
        publicId: `qd${run}`,
        content: content('Nothing happened.'),
        periods: [{ startDate: date, endDate: date }],
      },
    }),
  );
  await made(
    await request.post('/api/admin/diary', {
      data: { date, access: 'public', content: content('A quiet entry.') },
    }),
  );
  const tag = await made(
    await request.post('/api/admin/tags', {
      data: {
        title: `Quiet tag ${run}`,
        slug: `quiet-tag-${run}`,
        publicId: `qt${run}`,
        description: '',
        synonyms: [],
      },
    }),
  );
  const pages = await (
    await request.get('/api/admin/pages', { params: { limit: 1 } })
  ).json();
  forms.push(
    `/admin/projects/${project.projectUuid}/edit/`,
    `/admin/events/${event.eventUuid}/edit/`,
    `/admin/diary/by-date/${date}/`,
    `/admin/tags/${tag.tagUuid}/edit/`,
    `/admin/pages/${pages.items[0].pageUuid}/edit/`,
  );
  await setAccess(request, false);
});

test.afterAll(async ({ request }) => {
  await setAccess(request, false);
});

test('no admin page asks about AI while it is off', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  const paths = [
    '/admin/',
    '/admin/about/',
    '/admin/ai/',
    '/admin/ai/?tab=sessions',
    '/admin/ai/?tab=memory',
    '/admin/ai/?tab=connection',
  ];
  paths.push(...forms);
  expect(forms).toHaveLength(5);

  const asked: string[] = [];
  const errors: string[] = [];
  page.on('request', (sent) => {
    const url = new URL(sent.url());
    if (ASKS_ABOUT_AI.test(url.pathname)) asked.push(url.pathname);
  });
  page.on('pageerror', (error) =>
    errors.push(`${page.url()}: ${error.message}`),
  );
  // A development build says what did not match; production only that
  // something did.
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' || text.includes('Hydration'))
      errors.push(`${page.url()}: ${text.slice(0, 500)}`);
  });

  for (const path of paths) {
    await open(page, path);
    // Nothing points to sessions: no button in the bar, nothing waiting,
    // no ✦ in a form or at a field's label, no memory or proposal in it.
    await expect(page.locator('[data-ai-bar]')).toHaveCount(0);
    await expect(page.locator('[data-ai-sessions]')).toHaveCount(0);
    await expect(page.locator('[data-ai-entity]')).toHaveCount(0);
    await expect(page.locator('[data-ai-memory-block]')).toHaveCount(0);
    await expect(page.locator('[data-ai-offers]')).toHaveCount(0);
    await expect(page.locator('[data-ai-field-offer]')).toHaveCount(0);
  }
  expect(asked).toEqual([]);
  expect(errors).toEqual([]);
});

test('a file’s description is a field like any other while AI is off', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  const listed = (
    await (
      await request.get('/api/admin/assets', { params: { page: 1 } })
    ).json()
  ).items as { asset: { assetUuid: string } }[];
  const assetUuid = listed[0]!.asset.assetUuid;
  const read = await (
    await request.get(`/api/admin/assets/${assetUuid}/description`)
  ).json();
  // Nothing is said of what an AI proposes.
  expect(read).not.toHaveProperty('offers');

  const asked: string[] = [];
  page.on('request', (sent) => {
    const url = new URL(sent.url());
    if (ASKS_ABOUT_AI.test(url.pathname)) asked.push(url.pathname);
  });
  await open(page, '/admin/assets/');
  await page.locator(`[data-asset-uuid="${assetUuid}"]`).first().click();
  await expect(page.locator('[data-file-description]')).toBeVisible();
  await expect(page.locator('[data-file-description-input]')).toBeEnabled();
  await expect(page.locator('[data-ai-field-offer]')).toHaveCount(0);
  expect(asked).toEqual([]);
  // An app's one-time download is no address at all.
  expect((await request.get('/api/mcp/download/none')).status()).toBe(404);
});

test('the tabs that need AI point to the switch', async ({ page }) => {
  for (const tab of ['sessions', 'memory']) {
    await open(page, `/admin/ai/?tab=${tab}`);
    await expect(page.locator('[data-ai-off]')).toBeVisible();
    await expect(page.locator('[data-sessions-panel]')).toHaveCount(0);
  }
  // Off, the page opens where it is turned on.
  await open(page, '/admin/ai/');
  await expect(page.locator('[data-ai-off]')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'AI in Thei' })).toBeVisible();
});

test('what would change AI answers as if it were not there', async ({
  request,
}) => {
  for (const [method, path] of [
    ['get', '/api/admin/ai/sessions'],
    ['post', '/api/admin/ai/sessions'],
    ['get', '/api/admin/ai/sessions/ais-none'],
    ['patch', '/api/admin/ai/sessions/ais-none'],
    ['delete', '/api/admin/ai/sessions/ais-none'],
    ['post', '/api/admin/ai/sessions/ais-none/messages'],
    ['post', '/api/admin/ai/sessions/ais-none/stop'],
    ['get', '/api/admin/ai/sessions/ais-none/events'],
    ['post', '/api/admin/ai/actions/apply'],
    ['post', '/api/admin/ai/actions/aia-none/reject'],
    ['post', '/api/admin/ai/actions/aia-none/never'],
    ['post', '/api/admin/ai/actions/aia-none/restore'],
    ['post', '/api/admin/ai/actions/aia-none/undo'],
    ['post', '/api/admin/ai/actions/aia-none/comment'],
    ['post', '/api/admin/ai/actions/aia-none/parts'],
    ['get', '/api/admin/ai/entities/project/p-none'],
  ] as const) {
    const response =
      method === 'get' || method === 'delete'
        ? await request[method](path)
        : await request[method](path, { data: {} });
    expect(`${method} ${path}: ${response.status()}`).toBe(
      `${method} ${path}: 404`,
    );
  }
});

test('turned on from the switch, the admin offers it at once', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  await open(page, '/admin/ai/?tab=connection');
  await expect(page.locator('[data-ai-bar]')).toHaveCount(0);
  const toggle = page.getByRole('switch', { name: 'AI in Thei' });
  await toggle.click();
  await expect(toggle).toBeChecked();
  // What the admin bar knew of AI was told at once, without loading the
  // page again.
  await expect(page.locator('[data-ai-bar]')).toBeVisible();
  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(page.locator('[data-sessions-panel]')).toBeVisible();
});
