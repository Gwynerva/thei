import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { startFakeModel, type FakeModel } from '../helpers/fake-model';
import { turnAiOff, turnAiOn } from './helpers/ai';
import { uploadControls, uploadPicture } from './helpers/upload';

/**
 * With AI off, the admin works as if AI were not there: no page, form or
 * widget asks anything about it, nothing about it shows but the way to the
 * switch, and what would change it answers as if it did not exist. What it
 * proposed while it was on waits unseen: the spec proposes some first, so
 * that nothing shown of it is something there was none of.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

/**
 * What a page asks only while AI is on: its sessions and their actions, an
 * entity's memory and proposals, the entity a public page shows, a ✦'s
 * question, the dashboard's overview, a check run, a text's edits, the
 * memory and templates. The Connection tab may read the model's settings,
 * which are set before AI is turned on.
 */
const ASKS_ABOUT_AI =
  /\/api\/admin\/ai\/(sessions|actions|entities|entity-at|ask|overview|check|texts|memory|templates|terms)\b/;

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

/** The requests a page sends about AI from now on. */
function askedAboutAi(page: Page) {
  const asked: string[] = [];
  page.on('request', (sent) => {
    const url = new URL(sent.url());
    if (ASKS_ABOUT_AI.test(url.pathname)) asked.push(url.pathname);
  });
  return asked;
}

/** The quick search's ✦ row; its phrase is set with non-breaking spaces. */
const ASK_AI = /Ask\sAI/u;

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

/** The forms the test opens, one of each kind it made. */
const forms: string[] = [];
/** Their public pages, under the admin bar. */
const publicPages: string[] = [];
let projectUuid = '';
let projectTitle = '';
/** A picture of the spec's own, a description proposed for it. */
let pictureUuid = '';
/** The app's key the proposals came with. */
let tokenUuid = '';
let model: FakeModel;

async function made(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body;
}

/** Proposes one action as an app with a reader's key: it waits, undecided. */
async function propose(
  request: APIRequestContext,
  token: string,
  action: Record<string, unknown>,
) {
  const response = await request.post('/api/mcp', {
    headers: {
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'propose',
      authorization: `Bearer ${token}`,
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'propose',
        arguments: { actions: [action] },
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'e2e', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    },
  });
  const answer = (await response.json()) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  const text = answer.result.content.map((part) => part.text).join('\n');
  expect(answer.result.isError, text).toBeFalsy();
  expect(text).toMatch(/- aia-[\w-]+: proposed/);
}

/**
 * One entity of each kind: the fixture holds pages, and the other specs make
 * the rest for themselves. A diary day and a tag title are each one of a
 * kind, so a run makes its own, and the spec can run again on the same
 * database. While AI is on, an app proposes what would show at a form's
 * labels, in a text's editor, in a section's window and at a file's
 * description; then it is turned off.
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

  projectTitle = `Quiet ${run}`;
  const project = await made(
    await request.post('/api/admin/projects', {
      data: {
        title: projectTitle,
        summary: 'Nothing to see.',
        access: 'public',
        humanReadableSlug: 'quiet',
        publicId: `quiet${run}`,
        showcase: false,
        cv: false,
        descriptionContent: content('Nothing here.'),
        sections: [
          {
            title: `Quiet part ${run}`,
            summary: 'A part of it.',
            humanReadableSlug: 'part',
            publicId: `qp${run}`,
            isPrivate: false,
            content: content('A part of nothing.'),
            periods: [],
          },
        ],
        relations: [],
      },
    }),
  );
  projectUuid = project.projectUuid;
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
    `/admin/projects/${projectUuid}/edit/`,
    `/admin/events/${event.eventUuid}/edit/`,
    `/admin/diary/by-date/${date}/`,
    `/admin/tags/${tag.tagUuid}/edit/`,
    `/admin/pages/${pages.items[0].pageUuid}/edit/`,
  );
  publicPages.push(
    '/',
    `/projects/quiet-quiet${run}/`,
    `/events/quiet-day-qd${run}/`,
  );
  // A picture of its own: the spec runs alone or after any other, and the
  // fixture's own files were seeded with no settings to show them by.
  pictureUuid = (await uploadPicture(request)).asset.assetUuid;
  const { sections } = await (
    await request.get(`/api/admin/projects/${projectUuid}`)
  ).json();
  const sectionUuid = sections[0].sectionUuid as string;
  expect(sectionUuid).toBeTruthy();

  model = await startFakeModel([], { models: ['fake-e2e'] });
  await turnAiOn(request, model);
  const { token, item } = await (
    await request.post('/api/admin/api-tokens', {
      data: { label: 'Quiet', preset: 'reader' },
    })
  ).json();
  tokenUuid = item.tokenUuid;
  const projectRef = `project:${projectUuid}`;
  await propose(request, token, {
    kind: 'field',
    target: projectRef,
    field: 'summary',
    value: 'Nothing at all to see.',
    reason: 'Says it plainly.',
  });
  await propose(request, token, {
    kind: 'revise',
    target: projectRef,
    text: 'description',
    mode: 'proofread',
    reason: 'A word missing.',
    corrections: [
      {
        find: 'Nothing here',
        replace: 'Nothing is here',
        category: 'grammar',
        reason: 'A word missing.',
      },
    ],
  });
  await propose(request, token, {
    kind: 'field',
    target: `project-section:${sectionUuid}`,
    field: 'summary',
    value: 'A quiet part of it.',
    reason: 'Says which part.',
  });
  await propose(request, token, {
    kind: 'describe',
    file: pictureUuid,
    text: 'A square of one colour',
    reason: 'What the picture shows.',
  });
  // On, all of it waits where it would be shown.
  const panel = await (
    await request.get(`/api/admin/ai/entities/project/${projectUuid}`)
  ).json();
  expect(panel.offers.length).toBeGreaterThanOrEqual(2);
  const described = await (
    await request.get(`/api/admin/assets/${pictureUuid}/description`)
  ).json();
  expect(described.offers).toHaveLength(1);
  await setAccess(request, false);
});

test.afterAll(async ({ request }) => {
  if (tokenUuid) await request.delete(`/api/admin/api-tokens/${tokenUuid}`);
  await turnAiOff(request);
  await model?.close();
});

test('no admin page asks about AI while it is off', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await setAccess(request, false);
  // Nothing waits, as far as the admin is told.
  const summary = await (
    await request.get('/api/admin/dashboard-summary')
  ).json();
  expect(summary).toMatchObject({
    aiEnabled: false,
    aiModelReady: false,
    aiWaiting: 0,
  });
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

  const asked = askedAboutAi(page);
  const errors: string[] = [];
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
    await expect(page.locator('[data-ai-offer-chip]')).toHaveCount(0);
  }
  expect(asked).toEqual([]);
  expect(errors).toEqual([]);
});

test('a public page asks nothing about AI under the admin bar', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  const asked = askedAboutAi(page);
  for (const path of publicPages) {
    await open(page, path);
    // The admin bar is there, without its ✦.
    await expect(
      page.locator('header a[href="/admin/"]').first(),
    ).toBeVisible();
    await expect(page.locator('[data-ai-bar]')).toHaveCount(0);
  }
  expect(asked).toEqual([]);
});

test('a text’s editor and a section’s window show nothing of AI while it is off', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  const asked = askedAboutAi(page);
  const form = `/admin/projects/${projectUuid}/edit/`;

  // The description's editor: no ✦, no count, no edit waiting over the text.
  await open(page, form);
  await page.locator('button[data-field]').first().click();
  await expect(
    page.locator('dialog .content-editor [contenteditable="true"]').first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-editor-ai]')).toHaveCount(0);
  await expect(page.locator('[data-editor-ai-count]')).toHaveCount(0);
  await expect(page.locator('[data-editor-notice="ai"]')).toHaveCount(0);

  // A section's window: no ✦ at its head or at its labels.
  await open(page, form);
  await page
    .locator('[data-sections] [data-section-row]')
    .first()
    .locator('[data-section-open]')
    .click();
  const dialog = page.locator('dialog[open]').last();
  await expect(dialog.locator('[data-field-label]').first()).toBeVisible();
  await expect(dialog.locator('[data-ai-entity]')).toHaveCount(0);
  await expect(dialog.locator('[data-ai-field-offer]')).toHaveCount(0);
  expect(asked).toEqual([]);
});

test('a file’s description is a field like any other while AI is off', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  const read = await (
    await request.get(`/api/admin/assets/${pictureUuid}/description`)
  ).json();
  // Nothing is said of what an AI proposed.
  expect(read).not.toHaveProperty('offers');

  const asked = askedAboutAi(page);
  await open(page, '/admin/assets/');
  await page.locator(`[data-asset-uuid="${pictureUuid}"]`).first().click();
  await expect(page.locator('[data-file-description]')).toBeVisible();
  await expect(page.locator('[data-file-description-input]')).toBeEnabled();
  await expect(page.locator('[data-ai-field-offer]')).toHaveCount(0);
  expect(asked).toEqual([]);
  // An app's one-time download is no address at all.
  expect((await request.get('/api/mcp/download/none')).status()).toBe(404);
});

test('an upload’s last step describes the file with no ✦ while AI is off', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  const asked = askedAboutAi(page);
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator('[data-pick]').click();
  // A colour of its own: a file new to the library is described.
  const buffer = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256),
      },
    },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'quiet.png', mimeType: 'image/png', buffer });
  const { newVariant, next, description } = uploadControls(page);
  await newVariant.click();
  await expect(next).toBeEnabled({ timeout: 20_000 });
  await next.click();
  await expect(page.locator('[data-upload-screen="describe"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(description).toBeEnabled();
  await expect(page.locator('[data-ai-field-offer]')).toHaveCount(0);
  expect(asked).toEqual([]);
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
  // And the site's settings hold the switch itself: with the ✦ gone, that
  // is where it is looked for.
  await open(page, '/admin/settings/');
  await expect(
    page
      .locator('[data-ai-switch]')
      .getByRole('switch', { name: 'AI in Thei' }),
  ).toBeVisible();
});

test('what would change AI answers as if it were not there', async ({
  request,
}) => {
  await setAccess(request, false);
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
    ['get', '/api/admin/ai/actions/aia-none/text'],
    ['get', '/api/admin/ai/entities/project/p-none'],
    ['post', '/api/admin/ai/ask'],
    ['get', '/api/admin/ai/entity-at'],
    ['get', '/api/admin/ai/overview'],
    ['post', '/api/admin/ai/check'],
    ['get', '/api/admin/ai/texts/reviews'],
    ['get', '/api/admin/ai/memory'],
    ['get', '/api/admin/ai/templates'],
    ['post', '/api/admin/ai/templates/none/run'],
    ['post', '/api/admin/ai/terms'],
    ['post', '/api/admin/ai/sessions/ais-none/continue'],
    ['post', '/api/admin/ai/actions/aia-none/edit'],
    ['post', '/api/admin/ai/actions/aia-none/taken'],
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

test('the quick search offers no ✦ while AI is off', async ({
  page,
  request,
}) => {
  await setAccess(request, false);
  const question = 'what did I do on the lake';
  const answer = await (
    await request.get('/api/search', {
      params: { q: question, quick: '1', typing: '1' },
    })
  ).json();
  expect(
    (answer.actions as { type: string }[]).map((action) => action.type),
  ).not.toContain('ask-ai');
  await open(page, '/admin/');
  await page.keyboard.press('Control+KeyK');
  const answered = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/search' &&
      new URL(response.url()).searchParams.get('q') === question,
  );
  await page.getByRole('combobox').fill(question);
  await answered;
  await expect(page.getByRole('option', { name: ASK_AI })).toHaveCount(0);
});

test('turned off from the switch, nothing of it stays, a text’s ✦ included', async ({
  page,
  request,
}) => {
  // On, with a model to answer: a text's editor offers its ✦.
  await turnAiOn(request, model);
  await open(page, '/admin/settings/');
  await expect(page.locator('[data-ai-bar]')).toBeVisible();
  // What the page knew of AI is told without loading it again.
  await page.evaluate(() => {
    (window as unknown as { stayed?: boolean }).stayed = true;
  });
  const toggle = page
    .locator('[data-ai-switch]')
    .getByRole('switch', { name: 'AI in Thei' });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('[data-ai-bar]')).toHaveCount(0);

  const asked = askedAboutAi(page);
  await page
    .locator(
      'header a[href="/admin/projects"], header a[href="/admin/projects/"]',
    )
    .first()
    .click();
  await page.getByRole('searchbox').fill(projectTitle);
  await page.locator(`a[href="/admin/projects/${projectUuid}/edit/"]`).click();
  await page.locator('button[data-field]').first().click();
  await expect(
    page.locator('dialog .content-editor [contenteditable="true"]').first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-editor-ai]')).toHaveCount(0);
  await expect(page.locator('[data-editor-notice="ai"]')).toHaveCount(0);
  await expect(page.locator('[data-ai-field-offer]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { stayed?: boolean }).stayed,
    ),
  ).toBe(true);
  expect(asked).toEqual([]);
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
  // And the quick search offers to ask it.
  const question = 'what did I do on the lake';
  const answer = await (
    await request.get('/api/search', {
      params: { q: question, quick: '1', typing: '1' },
    })
  ).json();
  expect(
    (answer.actions as { type: string }[]).map((action) => action.type),
  ).toContain('ask-ai');
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox').fill(question);
  await expect(page.getByRole('option', { name: ASK_AI })).toBeVisible();
});
