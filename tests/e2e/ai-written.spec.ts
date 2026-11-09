import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  startFakeModel,
  type FakeModel,
  type FakeRequest,
  type FakeTurn,
} from '../helpers/fake-model';
import { turnAiOff, turnAiOn } from './helpers/ai';

/**
 * A text an AI wrote whole — in place of a text, or a new project's texts —
 * opened from its card in the session and read as it would stand, block by
 * block: what is left out is not written, the rest is applied at once and
 * undone as any proposal.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1280, height: 800 };
const run = Date.now() % 100_000;
// A day of its own, far from the days other specs write.
const DATE = new Date(Date.UTC(2002, 0, 1) + (run % 1400) * 86_400_000)
  .toISOString()
  .slice(0, 10);
const PROJECT = `Lighthouse ${run}`;
let diaryUuid = '';
let model: FakeModel;

function lastOwnerWords(request: FakeRequest): string {
  const messages: { role: string; content?: unknown }[] =
    request.body.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index--)
    if (messages[index]!.role === 'user')
      return String(messages[index]!.content ?? '').toLowerCase();
  return '';
}

function toolAnswered(request: FakeRequest): boolean {
  const messages: { role: string }[] = request.body.messages ?? [];
  const last = messages.map((message) => message.role).lastIndexOf('user');
  return messages.slice(last + 1).some((message) => message.role === 'tool');
}

function script(request: FakeRequest): FakeTurn {
  if (toolAnswered(request)) return { text: 'I wrote it.' };
  const said = lastOwnerWords(request);
  const action = said.includes('rewrite')
    ? {
        kind: 'write',
        target: `diary-entry:${DATE}`,
        text: 'body',
        mode: 'replace',
        reason: 'Written out.',
        markdown: [
          'The morning was grey.',
          'We walked along the pier, slowly.',
          'A gull took the bread.',
          'At noon the ferry came.',
        ].join('\n\n'),
      }
    : said.includes('project')
      ? {
          kind: 'create',
          reason: 'As you told it.',
          entity: 'project',
          fields: {
            title: PROJECT,
            summary: 'A lighthouse.',
            description: 'A lighthouse restored.',
            sections: [
              {
                title: 'Survey',
                body: 'The tower was measured.\n\nThe lamp was gone.',
              },
              { title: 'Repairs', body: 'The stairs were mended.' },
            ],
          },
        }
      : undefined;
  if (!action) return { text: 'Say what to write.' };
  return { toolCalls: [{ name: 'propose', input: { actions: [action] } }] };
}

test.beforeAll(async ({ request }) => {
  const entry = await (
    await request.post('/api/admin/diary', {
      data: {
        date: DATE,
        access: 'public',
        content: {
          data: {
            blocks: ['The morning was grey.', 'We walked along the pier.'].map(
              (text) => ({ type: 'paragraph', data: { text } }),
            ),
          },
        },
      },
    })
  ).json();
  expect(entry.type, JSON.stringify(entry)).toBe('success');
  diaryUuid = entry.diaryUuid;
  model = await startFakeModel(script, { models: ['fake-e2e'] });
  await turnAiOn(request, model);
});

test.afterAll(async ({ request }) => {
  await turnAiOff(request);
  await model?.close();
});

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem('thei-review-view', 'read'),
  );
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function propose(page: Page, words: string) {
  await page.goto('/admin/ai/?session=new');
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await page.locator('[data-composer-field]').click();
  await page.keyboard.type(words);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/ai\/\?session=ais-/);
  await expect(page.locator('[data-composer-stop]')).toHaveCount(0, {
    timeout: 40_000,
  });
}

const review = (page: Page) => page.locator('[data-review]');
const card = (page: Page) => page.locator('[data-review-card]');

/** Leaves out the block of these words, from its part's card. */
async function leaveOut(page: Page, words: string) {
  await review(page)
    .locator('[data-review-block]', { hasText: words })
    .locator('[data-review-part]')
    .first()
    .click();
  await card(page).locator('[data-review-keep]').click();
}

async function diaryText(page: Page) {
  return JSON.stringify(
    await (await page.request.get(`/api/admin/diary/${diaryUuid}`)).json(),
  );
}

test('a text written in place of one is read whole, and only what is taken is written', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Rewrite the entry');
  await page.locator('[data-action-open]').last().click();
  await expect(review(page)).toBeVisible();
  await expect(review(page)).toHaveAttribute('data-review-mode', 'written');
  // The whole text as it would stand: the block it keeps, the one it
  // rewrites and the two it brings.
  for (const words of [
    'The morning was grey.',
    'slowly',
    'A gull took the bread.',
    'At noon the ferry came.',
  ])
    await expect(review(page)).toContainText(words);
  await expect(page.locator('[data-review-count]')).toContainText('/ 3');

  await leaveOut(page, 'A gull took the bread.');
  const finish = page.locator('[data-review-finish]');
  // Nothing taken yet, the finish takes all the rest first.
  await finish.click();
  await expect(finish).toHaveText('Apply · 2');
  await finish.click();
  await expect(review(page)).toBeHidden();

  await expect.poll(() => diaryText(page)).toContain('At noon the ferry came.');
  const text = await diaryText(page);
  expect(text).toContain('slowly');
  expect(text).not.toContain('A gull');

  // Undone, the text is as it was. The row is applied and settled first: a
  // press right after its state changed is taken as the end of the last one.
  const row = page.locator('[data-action-state]').last();
  await expect(row).toHaveAttribute('data-action-state', 'applied');
  await expect(row).not.toHaveAttribute('data-action-settling');
  await row.locator('[data-action-undo]').click();
  await expect(row).toHaveAttribute('data-action-state', 'undone');
  await expect
    .poll(() => diaryText(page))
    .not.toContain('At noon the ferry came.');
  expect(await diaryText(page)).toContain('We walked along the pier.');
});

test('a new project’s texts are read as one, each under its name', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Make a project of it');
  await page.locator('[data-action-open]').last().click();
  await expect(review(page)).toBeVisible();
  const document = review(page).locator('[data-review-document]');
  await expect(document.locator('h2')).toHaveText([
    'Description',
    'Section “Survey”',
    'Section “Repairs”',
  ]);
  await expect(page.locator('[data-review-count]')).toContainText('/ 4');

  await leaveOut(page, 'The lamp was gone.');
  await page.locator('[data-review-finish]').click();
  await page.locator('[data-review-finish]').click();
  await expect(review(page)).toBeHidden();

  let projectUuid = '';
  await expect
    .poll(async () => {
      const list = await (
        await page.request.get(
          `/api/admin/projects?q=${encodeURIComponent(PROJECT)}`,
        )
      ).json();
      projectUuid =
        (list.items ?? []).find(
          (item: { title?: string }) => item.title === PROJECT,
        )?.projectUuid ?? '';
      return projectUuid;
    })
    .not.toBe('');
  const project = JSON.stringify(
    await (await page.request.get(`/api/admin/projects/${projectUuid}`)).json(),
  );
  expect(project).toContain('A lighthouse restored.');
  expect(project).toContain('The tower was measured.');
  expect(project).toContain('The stairs were mended.');
  expect(project).not.toContain('The lamp was gone.');
});
