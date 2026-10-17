import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  startFakeModel,
  type FakeModel,
  type FakeRequest,
  type FakeTurn,
} from '../helpers/fake-model';
import { turnAiOff, turnAiOn } from './helpers/ai';
import { expectPopupUsable } from './helpers/popup';

/**
 * An AI's corrections of a text gone through part by part: on their own
 * screen from the session, the text as it will read with each part marked
 * where it stands, accepted or kept as it was and applied at once; and in
 * the editor, taken into its text as one change the form saves — the save
 * button changing once, never flickering. On a computer, and on a phone.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };
const run = Date.now() % 100_000;
// A day of its own, far from the days other specs write.
const DATE = new Date(Date.UTC(2014, 0, 1) + (run % 3000) * 86_400_000)
  .toISOString()
  .slice(0, 10);
// The entry a new order is proposed for, on a day of its own as well.
const ORDER_DATE = new Date(Date.UTC(2010, 0, 1) + (run % 1400) * 86_400_000)
  .toISOString()
  .slice(0, 10);
const REPEAT = 'Morning on the boat, the sea calm.';
let diaryUuid = '';
let orderUuid = '';
// The entry whose links lead nowhere, on a day of its own too.
const LINKS_DATE = new Date(Date.UTC(2006, 0, 1) + (run % 1400) * 86_400_000)
  .toISOString()
  .slice(0, 10);
let linksUuid = '';
let harbourUuid = '';
let model: FakeModel;

/** The corrections the model proposes, by a word of the owner's message. */
const CORRECTIONS: Record<string, Record<string, unknown>[]> = {
  first: [
    {
      find: 'wierd',
      replace: 'weird',
      category: 'spelling',
      reason: 'A typo.',
    },
    {
      find: 'We waited',
      replace: 'We wait',
      category: 'grammar',
      certainty: 'unsure',
      reason: 'The rest of the entry is in the present.',
    },
  ],
  second: [
    { find: 'teh', replace: 'the', category: 'spelling', reason: 'A typo.' },
  ],
  third: [
    { find: 'peir', replace: 'pier', category: 'spelling', reason: 'A typo.' },
  ],
  fourth: [
    {
      find: 'morning by',
      replace: 'morning, by',
      category: 'punctuation',
      reason: 'A pause.',
    },
    { find: 'sea', replace: 'Sea', category: 'case', reason: 'A name.' },
  ],
};

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
  if (toolAnswered(request)) return { text: 'I proposed corrections.' };
  const said = lastOwnerWords(request);
  if (said.includes('mend'))
    return {
      toolCalls: [
        {
          name: 'propose',
          input: {
            actions: [
              {
                kind: 'revise',
                target: `diary-entry:${LINKS_DATE}`,
                text: 'body',
                mode: 'relink',
                reason: 'Links that lead nowhere.',
                relinks: [
                  {
                    link: 'rl-1/0/0',
                    to: `thei:project/${harbourUuid}#outcomes`,
                    reason: 'The heading was renamed.',
                  },
                  {
                    link: 'rl-1/0/1',
                    to: null,
                    certainty: 'unsure',
                    reason: 'What it led to is gone.',
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  if (said.includes('tidy'))
    return {
      toolCalls: [
        {
          name: 'propose',
          input: {
            actions: [
              {
                kind: 'revise',
                target: `diary-entry:${ORDER_DATE}`,
                text: 'body',
                mode: 'order',
                reason: 'A repeat dropped, the evening given a heading.',
                markdown: `${REPEAT}

## Evening

Evening with the photos.`,
                removals: [
                  {
                    quote: 'Morning on the boat',
                    reason: 'A literal repeat',
                    duplicateOf: 'Morning on the boat',
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  const which = Object.keys(CORRECTIONS).find((word) => said.includes(word));
  if (!which) return { text: 'Say which proofreading.' };
  return {
    toolCalls: [
      {
        name: 'propose',
        input: {
          actions: [
            {
              kind: 'revise',
              target: `diary-entry:${DATE}`,
              text: 'body',
              mode: 'proofread',
              reason: 'Proofread the entry.',
              corrections: CORRECTIONS[which],
            },
          ],
        },
      },
    ],
  };
}

test.beforeAll(async ({ request }) => {
  const entry = await (
    await request.post('/api/admin/diary', {
      data: {
        date: DATE,
        access: 'public',
        content: {
          data: {
            blocks: [
              {
                type: 'paragraph',
                data: { text: 'It was a wierd morning by the sea.' },
              },
              {
                type: 'paragraph',
                data: {
                  text: 'We waited for teh captain on the peir.',
                },
              },
            ],
          },
        },
      },
    })
  ).json();
  expect(entry.type, JSON.stringify(entry)).toBe('success');
  diaryUuid = entry.diaryUuid;
  const ordered = await (
    await request.post('/api/admin/diary', {
      data: {
        date: ORDER_DATE,
        access: 'public',
        content: {
          data: {
            blocks: [REPEAT, REPEAT, 'Evening with the photos.'].map(
              (text) => ({ type: 'paragraph', data: { text } }),
            ),
          },
        },
      },
    })
  ).json();
  expect(ordered.type, JSON.stringify(ordered)).toBe('success');
  orderUuid = ordered.diaryUuid;

  const harbour = await (
    await request.post('/api/admin/projects', {
      data: {
        title: `Harbour ${run}`,
        summary: 'A harbour.',
        access: 'public',
        humanReadableSlug: 'harbour',
        publicId: `hb${run}`,
        showcase: false,
        cv: false,
        descriptionContent: {
          data: {
            blocks: [{ type: 'header', data: { text: 'Outcomes', level: 2 } }],
          },
        },
      },
    })
  ).json();
  expect(harbour.type, JSON.stringify(harbour)).toBe('success');
  harbourUuid = harbour.projectUuid;
  const link = (id: string, words: string, fragment?: string) =>
    `<a data-content-link="entity" data-entity-type="project" data-entity-id="${id}"${fragment ? ` data-entity-fragment="${fragment}"` : ''}>${words}</a>`;
  const linked = await (
    await request.post('/api/admin/diary', {
      data: {
        date: LINKS_DATE,
        access: 'public',
        content: {
          data: {
            blocks: [
              {
                id: 'rl-1',
                type: 'paragraph',
                data: {
                  text: `We read ${link(harbourUuid, 'the results', 'results')} and ${link('p-gone', 'the old one')}.`,
                },
              },
            ],
          },
        },
      },
    })
  ).json();
  expect(linked.type, JSON.stringify(linked)).toBe('success');
  linksUuid = linked.diaryUuid;

  model = await startFakeModel(script, { models: ['fake-e2e'] });
  await turnAiOn(request, model);
});

test.afterAll(async ({ request }) => {
  await turnAiOff(request);
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

/** Asks the model in a new session; its proposal comes as an action. */
async function propose(page: Page, words: string) {
  await open(page, '/admin/ai/?session=new');
  await page.locator('[data-composer-field]').click();
  await page.keyboard.type(words);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/ai\/\?session=ais-/);
  // The first turn after a fresh build may take its time.
  await expect(page.locator('[data-composer-stop]')).toHaveCount(0, {
    timeout: 40_000,
  });
}

async function storedText(page: Page, uuid = diaryUuid) {
  const entry = await (
    await page.request.get(`/api/admin/diary/${uuid}`)
  ).json();
  return JSON.stringify(entry);
}

async function openEditor(page: Page) {
  await open(page, `/admin/diary/${diaryUuid}/edit/`);
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-field]').first().click();
  await expect(
    page.locator('dialog .content-editor [contenteditable="true"]').first(),
  ).toBeVisible({ timeout: 15_000 });
}

const review = (page: Page) => page.locator('[data-review]');
const card = (page: Page) => page.locator('[data-review-card]');

test('goes through corrections on their own screen and applies what is accepted', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Proofread the first time');
  await page.locator('[data-action-open]').last().click();
  await expect(review(page)).toBeVisible();
  await expect(review(page)).toHaveAttribute('data-review-mode', 'ai');

  // Each part is marked where it stands, the text read as it will be.
  const marks = review(page).locator('.review-mark');
  await expect(marks).toHaveCount(2);
  await expect(marks.first()).toHaveText('weird');

  // A part opens where it stands; deciding it goes on to the next.
  await marks.first().click();
  await expectPopupUsable(page, card(page));
  await expect(card(page)).toHaveAttribute('data-review-card', 'c1');
  await card(page).locator('[data-review-accept]').click();
  await expect(card(page)).toHaveAttribute('data-review-card', 'c2');
  await card(page).locator('[data-review-keep]').click();
  // Kept as it was, its words read as they were.
  await expect(marks.nth(1)).toHaveText('We waited');

  const finish = page.locator('[data-review-finish]');
  await expect(finish).toHaveText('Apply · 1');
  await finish.click();
  await expect(review(page)).toBeHidden();
  await expect(page.locator('[data-toast]')).toContainText('1 change');
  const text = await storedText(page);
  expect(text).toContain('weird morning');
  expect(text).toContain('We waited');
});

test('keeps a part left as it was in reach, and closing keeps the word on it', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Proofread the fourth time');
  const sessionUuid = new URL(page.url()).searchParams.get('session')!;
  await page.locator('[data-action-open]').last().click();
  await expect(review(page)).toBeVisible();
  const marks = review(page).locator('.review-mark');
  await expect(marks).toHaveCount(2);

  await marks.first().click();
  const left = (await card(page).getAttribute('data-review-card'))!;
  await card(page).locator('[data-review-keep]').click();
  await expect(card(page)).not.toHaveAttribute('data-review-card', left);
  // Back from the foot, the part left as it was opens, to be undone.
  await page.locator('[data-review-prev-part]').click();
  await expect(card(page)).toHaveAttribute('data-review-card', left);
  await expect(card(page).locator('[data-review-undo]')).toBeVisible();

  // A click around the review with a part's card open closes only the card.
  await page.mouse.click(12, DESKTOP.height / 2);
  await expect(card(page)).toBeHidden();
  await expect(review(page)).toBeVisible();

  // Nothing taken, the finish only closes; Escape does the same, and the
  // word on the part left goes to its session.
  await expect(page.locator('[data-review-finish]')).toHaveText('Close');
  await page.keyboard.press('Escape');
  await expect(review(page)).toBeHidden();
  await expect
    .poll(async () => {
      const detail = await (
        await page.request.get(`/api/admin/ai/sessions/${sessionUuid}`)
      ).json();
      return detail.actions[0].parts
        .map(
          (part: { id: string; state: string }) => `${part.id}:${part.state}`,
        )
        .join();
    })
    .toContain(`${left}:kept`);

  // Declined, it no longer waits in the entry's editor for the tests after.
  const detail = await (
    await page.request.get(`/api/admin/ai/sessions/${sessionUuid}`)
  ).json();
  expect(
    (
      await page.request.post(
        `/api/admin/ai/actions/${detail.actions[0].actionUuid}/reject`,
        { data: {} },
      )
    ).ok(),
  ).toBe(true);
});

test('goes through a new order, a repeat dropped and a heading left out', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Tidy the boat day');
  await page.locator('[data-action-open]').last().click();
  await expect(review(page)).toBeVisible();

  // The text reads as it will: the repeat folded, the heading tinted.
  const gone = review(page).locator('button.review-gone');
  await expect(gone).toHaveCount(1);
  await expect(gone).toContainText('Morning on the boat');
  const heading = review(page)
    .locator('[data-review-block]')
    .getByRole('heading', { name: 'Evening', exact: true });
  await expect(heading).toHaveCount(1);

  await gone.click();
  await expectPopupUsable(page, card(page));
  await card(page).locator('[data-review-accept]').click();
  // On to the heading, which is left out: it goes from the text.
  await expect(card(page)).toContainText('Evening');
  await card(page).locator('[data-review-keep]').click();
  await expect(heading).toHaveCount(0);
  // Left out, the heading stays a line to go back to.
  await expect(gone).toHaveCount(2);
  await expect(gone.last()).toContainText('Evening');

  const finish = page.locator('[data-review-finish]');
  await expect(finish).toHaveText('Apply · 1');
  await finish.click();
  await expect(review(page)).toBeHidden();
  const text = await storedText(page, orderUuid);
  expect(text.split('Morning on the boat')).toHaveLength(2);
  expect(text).toContain('Evening with the photos.');
  expect(text).not.toContain('"header"');
});

test('takes corrections into the editor as one change, the save button never flickering', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Proofread the second time');
  const sessionUuid = new URL(page.url()).searchParams.get('session')!;
  await openEditor(page);
  const notice = page.locator('[data-editor-notice="ai"]');
  await expect(notice).toBeVisible();

  // Every change of the save button's words from here on.
  const save = page.locator('[data-editor-save]');
  await expect(save).toHaveText('Saved');
  await save.evaluate((button) => {
    const seen: string[] = [];
    (window as unknown as { saveLabels: string[] }).saveLabels = seen;
    new MutationObserver(() => seen.push(button.textContent!.trim())).observe(
      button,
      { childList: true, characterData: true, subtree: true },
    );
  });

  await notice.locator('[data-review-open]').click();
  await expect(review(page)).toBeVisible();
  await expect(review(page).locator('.review-mark')).toHaveText('the');

  await page.locator('[data-review-sure]').click();
  await page.locator('[data-review-finish]').click();
  await expect(review(page)).toBeHidden();
  await expect(page.locator('dialog .content-editor')).toContainText(
    'for the captain',
  );
  await expect(notice).toBeHidden();
  await page.waitForTimeout(1000);
  const labels = await page.evaluate(
    () => (window as unknown as { saveLabels: string[] }).saveLabels,
  );
  expect([...new Set(labels)]).toEqual(['Save']);

  // Saved, the session hears the correction was made.
  await save.click();
  await expect(save).toHaveText('Saved');
  await expect
    .poll(async () => (await storedText(page)).includes('for the captain'), {
      timeout: 10_000,
    })
    .toBe(true);
  await expect
    .poll(
      async () => {
        const detail = await (
          await page.request.get(`/api/admin/ai/sessions/${sessionUuid}`)
        ).json();
        const action = detail.actions[0];
        return `${action.state}:${action.parts.map((part: { state: string }) => part.state).join()}`;
      },
      { timeout: 10_000 },
    )
    .toBe('applied:applied');
});

test('mends links that lead nowhere, each where it should lead', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Mend the links');
  await page.locator('[data-action-open]').last().click();
  await expect(review(page)).toBeVisible();

  // Each link's words are marked where they stand.
  const marks = review(page).locator('.review-mark');
  await expect(marks).toHaveCount(2);
  await expect(marks.first()).toHaveText('the results');
  await marks.first().click();
  const lines = card(page).locator('[data-review-link]');
  await expect(lines).toContainText(`Harbour ${run} › results`);
  await expect(lines).toContainText(`Harbour ${run} › Outcomes`);
  await card(page).locator('[data-review-accept]').click();
  // What it led to is gone: the words stay without the link.
  await expect(card(page)).toHaveAttribute('data-review-card', 'l2');
  await expect(lines).toContainText('what it led to is gone');
  await expect(lines).toContainText('no link, the words stay');
  await card(page).locator('[data-review-accept]').click();

  const finish = page.locator('[data-review-finish]');
  await expect(finish).toHaveText('Apply · 2');
  await finish.click();
  await expect(review(page)).toBeHidden();
  const text = await storedText(page, linksUuid);
  expect(text).toContain('data-entity-fragment=\\"outcomes\\"');
  expect(text).toContain('and the old one.');
  expect(text).not.toContain('p-gone');
});

test('fits a phone, its bar of decisions at the foot of the screen', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await propose(page, 'Proofread the third time');
  await page.setViewportSize(MOBILE);
  await openEditor(page);
  await page.locator('[data-review-open]').click();
  await expect(review(page)).toBeVisible();
  expect(
    await review(page).evaluate((box) => box.scrollWidth - box.clientWidth),
  ).toBeLessThanOrEqual(1);
  const bar = await review(page).locator('footer').boundingBox();
  expect(bar!.y + bar!.height).toBeGreaterThan(MOBILE.height - 4);

  await review(page).locator('.review-mark').first().click();
  await expectPopupUsable(page, card(page));
  await card(page).locator('[data-review-accept]').click();
  await page.locator('[data-review-finish]').click();
  await expect(review(page)).toBeHidden();
  await expect(page.locator('dialog .content-editor')).toContainText(
    'on the pier',
  );
});
