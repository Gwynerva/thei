import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  startFakeModel,
  type FakeModel,
  type FakeRequest,
  type FakeTurn,
} from '../helpers/fake-model';
import { expectPopupUsable } from './helpers/popup';

/**
 * Sessions as the owner has them: written to with mentions and line breaks
 * in a field that grows, answered by a model — played here by a local
 * server — with links in and out of the archive, proposals applied in part,
 * commented on, undone and brought back, a question answered, an answer
 * stopped and one read whole across a reload, and the list that follows it
 * all. On a computer, and on a phone where the list and the thread are two
 * screens.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const SLOW_LINE =
  'A long paragraph written slowly, so that a page may come in halfway and still read every word of it.';
const SLOW_TEXT = Array.from(
  { length: 6 },
  (_, index) => `${index + 1}. ${SLOW_LINE}`,
).join('\n\n');

const run = Date.now() % 100_000;
/** A table wider than a phone, and than a message on a tablet. */
const WIDE_TABLE = [
  'The lanterns, side by side:',
  '',
  '| Lantern | Where it hung | Lit | Colour of its glass | Who kept it | Notes |',
  '| :--- | :--- | ---: | :---: | :--- | :--- |',
  '| North | Over the harbour gate, by the old customs house | 1891 | Amber | The ferryman’s family | Relit every winter since the storm |',
  `| South | [${'the pier'}](https://example.com/pier) | 1903 | Green | The school | Its chain was mended twice |`,
  '',
  'That is all of them.',
].join('\n');
const PROJECT_TITLE = `Lantern harbour ${run}`;
let projectUuid = '';
let eventUuid = '';
let model: FakeModel;

/** The words of a message, its files' parts aside. */
function wordsOf(content: unknown): string {
  return Array.isArray(content)
    ? content
        .map((part: { type: string; text?: string }) =>
          part.type === 'text' ? (part.text ?? '') : '',
        )
        .join('\n')
    : String(content ?? '');
}

function lastOwnerWords(request: FakeRequest): string {
  const messages: { role: string; content?: unknown }[] =
    request.body.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index--)
    if (messages[index]!.role === 'user')
      return wordsOf(messages[index]!.content).toLowerCase();
  return '';
}

/** Whether a tool already answered since the owner last spoke. */
function toolAnswered(request: FakeRequest): boolean {
  const messages: { role: string }[] = request.body.messages ?? [];
  const last = messages.map((message) => message.role).lastIndexOf('user');
  return messages.slice(last + 1).some((message) => message.role === 'tool');
}

/** The model: what it does depends on a word of the owner's last message. */
function script(request: FakeRequest): FakeTurn {
  const said = lastOwnerWords(request);
  if (said.includes('propose'))
    return toolAnswered(request)
      ? { text: 'I proposed two changes.' }
      : {
          toolCalls: [
            {
              name: 'propose',
              input: {
                actions: [
                  {
                    kind: 'field',
                    target: `project:${projectUuid}`,
                    field: 'summary',
                    value:
                      'A harbour of lanterns, and the people who kept them.',
                    reason: 'Says what it is',
                  },
                  {
                    kind: 'field',
                    target: `event:${eventUuid}`,
                    field: 'reminder',
                    value: 'Look through the photos',
                    reason: 'They wait unsorted',
                  },
                ],
              },
            },
          ],
        };
  if (said.includes('question'))
    return {
      toolCalls: [
        {
          name: 'ask_owner',
          input: {
            question: 'Is it a part of the project or an event of its own?',
            options: ['A part of it', 'An event of its own'],
          },
        },
      ],
    };
  if (said.includes('slow')) return { text: SLOW_TEXT, delayMs: 40 };
  if (said.includes('wide table')) return { text: WIDE_TABLE };
  if (said.includes('make a file'))
    return toolAnswered(request)
      ? { text: 'Made it.' }
      : {
          toolCalls: [
            {
              name: 'make_file',
              input: {
                name: 'lanterns.csv',
                content: 'Name,Year\nHarbour,2024\n',
              },
            },
          ],
        };
  return {
    text: [
      'Here is what I found:',
      '',
      `- [${PROJECT_TITLE}](thei:project/${projectUuid}) — the biggest one;`,
      `- [the night of lanterns](thei:event/${eventUuid}).`,
      '',
      '> A quote to check.',
      '',
      'And elsewhere: [the docs](https://example.com/docs).',
    ].join('\n'),
  };
}

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

test.beforeAll(async ({ request }) => {
  const project = await (
    await request.post('/api/admin/projects', {
      data: {
        title: PROJECT_TITLE,
        summary: 'Lanterns.',
        access: 'public',
        humanReadableSlug: 'lantern-harbour',
        publicId: `lh${run}`,
        showcase: false,
        cv: false,
        descriptionContent: content('A harbour.'),
        relations: [],
      },
    })
  ).json();
  expect(project.type, JSON.stringify(project)).toBe('success');
  projectUuid = project.projectUuid;
  const event = await (
    await request.post('/api/admin/events', {
      data: {
        title: `Night of lanterns ${run}`,
        summary: 'A night.',
        access: 'public',
        humanReadableSlug: 'night-of-lanterns',
        publicId: `nl${run}`,
        content: content('Lanterns everywhere.'),
        periods: [{ startDate: '2019-08-10', endDate: '2019-08-10' }],
      },
    })
  ).json();
  expect(event.type, JSON.stringify(event)).toBe('success');
  eventUuid = event.eventUuid;

  model = await startFakeModel(script, { models: ['fake-e2e'] });
  expect(
    (
      await request.put('/api/admin/ai/settings', { data: { enabled: true } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.put('/api/admin/ai/model', {
        data: {
          provider: 'openai',
          baseUrl: model.url,
          model: 'fake-e2e',
          monthlyTokens: 10_000_000,
        },
      })
    ).ok(),
  ).toBe(true);
});

test.afterAll(async ({ request }) => {
  await request.put('/api/admin/ai/model', { data: { provider: 'none' } });
  await request.put('/api/admin/ai/settings', { data: { enabled: false } });
  await model?.close();
});

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const composer = (page: Page) => page.locator('[data-composer-field]');
const sendButton = (page: Page) => page.locator('[data-composer-send]');
const modelMessages = (page: Page) =>
  page.locator('[data-message-role="model"]');

/** The answer has come whole: nothing is left to stop. */
async function answered(page: Page) {
  await expect(page.locator('[data-composer-stop]')).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.locator('[data-message-writing]')).toHaveCount(0);
}

/** Writes in the composer of the session open now and sends with Enter. */
async function say(page: Page, words: string) {
  await composer(page).click();
  await page.keyboard.type(words);
  await page.keyboard.press('Enter');
}

/** Picks an entity for a mention from the picker the `@` opened. */
async function mention(page: Page, query: string) {
  const picker = page.locator('[data-floating-popup]').last();
  await expect(picker).toBeVisible();
  await page.keyboard.type(query);
  await expect(picker).toContainText(query);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(picker).toBeHidden();
}

/** What the admin bar says waits: a number, or nothing at all. */
async function expectBarCount(page: Page, count: number) {
  const badge = page.locator('[data-ai-bar-count]');
  if (count) await expect(badge).toHaveText(String(count));
  else await expect(badge).toHaveCount(0);
}

async function height(locator: Locator) {
  return (await locator.boundingBox())!.height;
}

let sessionUuid = '';

test('writes with mentions and line breaks, and reads the answer with its links', async ({
  page,
}) => {
  await open(page, '/admin/ai/?session=new');
  const field = composer(page);
  await field.click();
  const oneLine = await height(field);

  await page.keyboard.type('Look at @');
  await mention(page, PROJECT_TITLE);
  await expect(page.locator('[data-mention]')).toHaveText(PROJECT_TITLE);
  // The chip brought its space; one typed after it is not doubled.
  await page.keyboard.type(' and tell me');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('what you see');
  expect(await height(field)).toBeGreaterThan(oneLine + 8);
  expect(await field.innerText()).not.toMatch(/\s{2}and/);

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/ai\/\?session=ais-/);
  sessionUuid = new URL(page.url()).searchParams.get('session')!;
  // The field is one line again.
  await expect(field).toHaveText('');
  await expect.poll(() => height(field)).toBeLessThan(oneLine + 2);

  const mine = page.locator('[data-message-role="owner"]').first();
  await expect(mine.locator('a[href*="/projects/"]')).toHaveText(PROJECT_TITLE);
  await expect(mine.locator('br')).toHaveCount(1);
  await expect(page.locator('[data-session-title]')).toContainText(
    `Look at ${PROJECT_TITLE}`,
  );
  await expect(page.locator('[data-session-head]')).toContainText(
    PROJECT_TITLE,
  );

  await answered(page);
  const answer = modelMessages(page).last();
  await expect(answer.locator('blockquote')).toContainText('A quote to check');
  const inside = answer.locator(`a[href*="/projects/"]`);
  await expect(inside).toContainText(PROJECT_TITLE);
  await expect(answer.locator('a[href*="/events/"]')).toHaveCount(1);
  const outside = answer.locator('a[href="https://example.com/docs"]');
  await expect(outside).toHaveAttribute('target', '_blank');
  await expect(outside).toHaveAttribute('rel', /noopener/);
  await expect(
    page.locator(`[data-session-item="${sessionUuid}"]`),
  ).toBeVisible();
});

test('a bundle applied in part, the rest declined, undone and brought back', async ({
  page,
}) => {
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  // The admin bar counts what waits in every session, other runs' too.
  const before = (
    await (await page.request.get('/api/admin/dashboard-summary')).json()
  ).aiWaiting as number;
  await say(page, 'Propose something');
  await answered(page);
  const card = page.locator('[data-card="bundle"]').last();
  await expect(card.locator('[data-action]')).toHaveCount(2);
  await expectBarCount(page, before + 2);

  // The second is unticked: applying the rest declines it.
  await card.locator('[data-action-pick]').nth(1).click();
  await card.locator('[data-card-apply]').click();
  const [summary, reminder] = [
    card.locator('[data-action]').nth(0),
    card.locator('[data-action]').nth(1),
  ];
  await expect(summary).toHaveAttribute('data-action-state', 'applied');
  await expect(reminder).toHaveAttribute('data-action-state', 'rejected');
  await expect(page.locator('[data-toast]')).toBeVisible();
  await expectBarCount(page, before);
  const saved = await (
    await page.request.get(`/api/admin/projects/${projectUuid}`)
  ).json();
  expect(JSON.stringify(saved)).toContain('A harbour of lanterns');

  await summary.locator('[data-action-undo]').click();
  await expect(summary).toHaveAttribute('data-action-state', 'undone');
  await summary.locator('[data-action-restore]').click();
  await expect(summary).toHaveAttribute('data-action-state', 'pending');
  await expectBarCount(page, before + 1);
  // The list says it waits.
  await expect(
    page.locator(`[data-session-item="${sessionUuid}"] [data-session-waiting]`),
  ).toHaveText('1');
});

test('a comment says what it is about, and its field grows', async ({
  page,
}) => {
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  const summary = page
    .locator('[data-action][data-action-state="pending"]')
    .last();
  await summary.locator('[data-action-comment]').click();
  const box = page.locator('[data-comment-box]');
  await expectPopupUsable(page, box);
  await expect(box).toContainText('Summary');
  await expect(box).toContainText(PROJECT_TITLE);

  const field = box.locator('[data-comment-field]');
  const oneLine = await height(field);
  await field.pressSequentially('Shorter, please');
  for (const line of [
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
  ]) {
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type(line);
  }
  const tall = await height(field);
  expect(tall).toBeGreaterThan(oneLine * 3);
  // Past its height it scrolls rather than growing on.
  expect(
    await field.evaluate((area) => area.scrollHeight > area.clientHeight),
  ).toBe(true);
  // The send button stays at the foot of the field.
  const send = (await box.locator('[data-comment-send]').boundingBox())!;
  const area = (await field.boundingBox())!;
  expect(Math.abs(send.y + send.height - (area.y + area.height))).toBeLessThan(
    8,
  );

  await page.keyboard.press('Enter');
  await expect(box).toBeHidden();
  const comment = page.locator('[data-message-comment]').last();
  await expect(comment).toContainText('Summary');
  await expect(
    page.locator('[data-message-role="owner"]').last().locator('br'),
  ).toHaveCount(7);
  await answered(page);
});

test('asks the owner, and the session waits until answered', async ({
  page,
}) => {
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  // What waited is settled first, so the question alone waits.
  await page
    .locator('[data-card="bundle"]')
    .last()
    .locator('[data-card-reject]')
    .click();
  await expect(
    page.locator('[data-action][data-action-state="pending"]'),
  ).toHaveCount(0);
  await say(page, 'Ask me a question');
  const question = page.locator('[data-question]').last();
  await expect(question).toContainText('Is it a part of the project');
  await expect(
    page.locator(`[data-session-item="${sessionUuid}"] [data-session-waiting]`),
  ).toBeVisible();
  await question.locator('[data-question-option]').first().click();
  await expect(question).toContainText('A part of it');
  // The choices stay to be read, and take no other answer.
  for (const option of await question.locator('[data-question-option]').all())
    await expect(option).toBeDisabled();
  await answered(page);
  await expect(
    page.locator(`[data-session-item="${sessionUuid}"] [data-session-waiting]`),
  ).toHaveCount(0);
});

test('proposals turned away are told in the steps', async ({ page }) => {
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  // Both were declined lately: the code turns them away, and says so.
  await say(page, 'Propose it again');
  await answered(page);
  await expect(
    modelMessages(page).last().locator('[data-message-steps]'),
  ).toContainText('turned away');
});

test('an answer read whole across a reload, and one stopped halfway', async ({
  page,
}) => {
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  await say(page, 'Answer slowly');
  await expect(page.locator('[data-message-writing]')).toBeVisible();
  // The lines of the answer, its non-breaking spaces read as spaces.
  const lines = async () =>
    (await modelMessages(page).last().innerText())
      .replace(/[^\S\n]/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('A long paragraph'));
  await expect.poll(async () => (await lines()).length).toBeGreaterThan(1);
  // A page that comes in halfway reads what was written and what follows.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await expect(page.locator('[data-message-writing]')).toBeVisible();
  // While it still writes, every line before the last is whole.
  await expect.poll(async () => (await lines()).length).toBeGreaterThan(3);
  const halfway = await lines();
  for (const line of halfway.slice(0, -1)) expect(line).toBe(SLOW_LINE);
  await answered(page);
  expect(await lines()).toEqual(Array(6).fill(SLOW_LINE));

  await say(page, 'Slowly once more');
  await expect(page.locator('[data-message-writing]')).toBeVisible();
  // Words typed meanwhile neither hide the stop nor go with it.
  await composer(page).click();
  await page.keyboard.type('Not sent yet');
  await expect(sendButton(page)).toBeEnabled();
  await page.locator('[data-composer-stop]').click();
  await expect(
    modelMessages(page).last().locator('[data-notice="stopped"]'),
  ).toBeVisible();
  await answered(page);
  await expect(composer(page)).toHaveText('Not sent yet');
  await composer(page).press('ControlOrMeta+a');
  await composer(page).press('Backspace');
});

test('the list finds a session by what was said in it', async ({ page }) => {
  await open(page, '/admin/ai/');
  const search = page.locator('[data-session-search]');
  // A word of the model's, in another case.
  await search.fill('QUOTE TO CHECK');
  await expect(
    page.locator(`[data-session-item="${sessionUuid}"]`),
  ).toBeVisible();
  await search.fill('nothing of the kind at all');
  await expect(page.locator('[data-session-item]')).toHaveCount(0);
  await expect(page.locator('[data-session-list]')).toContainText(
    'Nothing found',
  );

  // The filter and the session's menu open whole, on top.
  await search.fill('');
  await page.locator('[data-session-filter]').click();
  await expectPopupUsable(page, page.locator('[data-session-filter-menu]'));
  await page.keyboard.press('Escape');
  await page.locator(`[data-session-item="${sessionUuid}"]`).click();
  await page.locator('[data-session-menu]').click();
  await expectPopupUsable(page, page.locator('[data-session-menu-popup]'));
  await page.keyboard.press('Escape');
});

test('on a phone, the list and the thread are two screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, '/admin/ai/');
  const list = page.locator('[data-session-list]');
  await expect(list).toBeVisible();
  await page.locator(`[data-session-item="${sessionUuid}"]`).click();
  await expect(page.locator('[data-session-thread]')).toBeVisible();
  await expect(list).toBeHidden();
  // No row is wider than the screen.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator('[data-session-menu]').click();
  await expectPopupUsable(page, page.locator('[data-session-menu-popup]'));
  await page.keyboard.press('Escape');
  await page.locator('[data-session-back]').click();
  await expect(list).toBeVisible();
});

test('brings files along, shows them to the model, and opens them as the library keeps them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  // Two files pasted at once: a picture and a text.
  await composer(page).click();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f80';
    context.fillRect(0, 0, 64, 48);
    const blob = await new Promise<Blob>((done) =>
      canvas.toBlob((made) => done(made!), 'image/png'),
    );
    const data = new DataTransfer();
    data.items.add(new File([blob], 'lantern.png', { type: 'image/png' }));
    data.items.add(
      new File(['Row 7, seat 12'], 'ticket.txt', { type: 'text/plain' }),
    );
    document.querySelector('[data-composer-field]')!.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator('[data-composer-file="ready"]')).toHaveCount(2);
  // A third from the menu, taken out again.
  await page.locator('[data-composer-attach]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-composer-files-pick]').click();
  await (
    await chooser
  ).setFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Notes'),
  });
  await expect(page.locator('[data-composer-file="ready"]')).toHaveCount(3);
  await page
    .locator('[data-composer-file]')
    .nth(2)
    .locator('[data-composer-file-remove]')
    .click();
  await expect(page.locator('[data-composer-file]')).toHaveCount(2);

  const before = model.requests.length;
  await say(page, 'Look at these');
  await answered(page);
  await expect(page.locator('[data-composer-file]')).toHaveCount(0);
  const sent = page.locator('[data-message-role="owner"]').last();
  await expect(sent.locator('[data-message-file]')).toHaveCount(2);

  // The model was shown the picture and the text, and told their ids.
  const seen = model.requests
    .slice(before)
    .flatMap((request) => request.body.messages ?? [])
    .find(
      (message: { role: string; content?: unknown }) =>
        message.role === 'user' && Array.isArray(message.content),
    );
  expect(seen).toBeTruthy();
  const parts = seen.content as { type: string; text?: string }[];
  expect(parts.some((part) => part.type === 'image_url')).toBe(true);
  expect(wordsOf(parts)).toContain('Row 7, seat 12');
  expect(wordsOf(parts)).toContain('«lantern.png»: a picture 64×48');

  // A file opens in the library's window of it, placed in this session.
  await sent.locator('[data-message-file]').first().click();
  const place = page.locator('dialog[open] [data-asset-usage]');
  await expect(place).toHaveCount(1);
  await expect(place).toContainText('Brought into the session');
  await expect(place).toHaveAttribute('href', /\/admin\/ai\/\?session=/);
  await page.keyboard.press('Escape');
});

test('a table in an answer fits every screen, scrolling sideways inside its message', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  await say(page, 'Show me a wide table');
  await answered(page);
  const answer = modelMessages(page).last();
  const table = answer.locator('[data-message-table]');
  await expect(table.locator('th')).toHaveCount(6);
  await expect(table.locator('td').first()).toHaveText('North');
  // Its alignment comes from the row of dashes; its links are the site's.
  await expect(table.locator('th').nth(2)).toHaveClass(/text-right/);
  await expect(table.locator('a[href="https://example.com/pier"]')).toHaveCount(
    1,
  );
  // The words around it stand before and after it.
  await expect(answer.locator('[data-message-text]')).toContainText(
    'side by side',
  );
  await expect(answer.locator('[data-message-text]')).toContainText(
    'all of them',
  );

  for (const size of [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(size);
    await table.scrollIntoViewIfNeeded();
    // Never the page sideways: the table scrolls inside its message, with a
    // thin bar over no rail of its own.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${size.width}`,
    ).toBe(true);
    const box = (await table.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    await expect(table).toHaveClass(/scrollbar-clear/);
    if (size.width === 375)
      expect(
        await table.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('makes a file asked for, and shows it under its answer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  await say(page, 'Please make a file of the lanterns');
  await answered(page);
  const answer = modelMessages(page).last();
  await expect(answer).toContainText('Made it.');
  const file = answer.locator('[data-message-file]');
  await expect(file).toHaveCount(1);
  await expect(file).toContainText('lanterns.csv');
  await file.click();
  // Its window places it in this session.
  const place = page.locator('dialog[open] [data-asset-usage]');
  await expect(place).toHaveCount(1);
  await expect(place).toHaveAttribute(
    'href',
    new RegExp(`/admin/ai/\\?session=${sessionUuid}$`),
  );
  await page.keyboard.press('Escape');
});

test('an archived session is the last group, only read until brought back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `/admin/ai/?session=${sessionUuid}`);
  await page.locator('[data-session-menu]').click();
  await page.locator('[data-session-menu-item="archive"]').click();

  await expect(page.locator('[data-session-archived]')).toBeVisible();
  await expect(composer(page)).toHaveCount(0);
  // What was decided in it is read, not decided again.
  const thread = page.locator('[data-session-thread]');
  await expect(
    thread.locator(
      '[data-action-apply], [data-action-undo], [data-action-restore], [data-action-never], [data-card-apply]',
    ),
  ).toHaveCount(0);

  const group = page.locator('[data-session-group="archive"]');
  await expect(group).toContainText('Deleted after 30 days');
  const item = page.locator(`[data-session-item="${sessionUuid}"]`);
  expect((await item.boundingBox())!.y).toBeGreaterThan(
    (await group.boundingBox())!.y,
  );

  await page.locator('[data-session-unarchive]').click();
  await expect(composer(page)).toBeVisible();
  await expect(page.locator('[data-session-archived]')).toHaveCount(0);
  await expect(
    thread.locator('[data-action-undo], [data-action-restore]'),
  ).not.toHaveCount(0);
});

test('a mention may name a heading inside what it names', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const stamp = Date.now();
  const title = `Chart room ${stamp}`;
  const project = await (
    await page.request.post('/api/admin/projects', {
      data: {
        title,
        summary: 'Charts.',
        access: 'public',
        humanReadableSlug: 'chart-room',
        publicId: `cr${stamp}`,
        showcase: false,
        cv: false,
        descriptionContent: {
          data: {
            blocks: [
              { type: 'header', data: { text: 'Soundings', level: 2 } },
              { type: 'paragraph', data: { text: 'Depths.' } },
            ],
          },
        },
        relations: [],
      },
    })
  ).json();
  expect(project.type, JSON.stringify(project)).toBe('success');

  await open(page, '/admin/ai/?session=new');
  await composer(page).click();
  await page.keyboard.type('Check @');
  const picker = page.locator('[data-link-picker="mention"]');
  await expect(picker).toBeVisible();
  await page.keyboard.type(title);
  await expect(picker.locator('[role="option"]').first()).toContainText(title);
  // → goes into the project: the select of its places opens.
  await page.keyboard.press('ArrowRight');
  await expect(picker).toHaveAttribute('data-link-level', 'entity');
  await page.keyboard.type('Soundings');
  await page.keyboard.press('Enter');
  await expect(picker.locator('[data-link-apply]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(picker).toHaveCount(0);

  const chip = page.locator('[data-mention]');
  await expect(chip).toHaveText(`${title} › Soundings`);
  await expect(chip).toHaveAttribute(
    'data-target',
    new RegExp(`^project/${project.projectUuid}#.+`),
  );
  await expect(composer(page)).toBeFocused();
});
