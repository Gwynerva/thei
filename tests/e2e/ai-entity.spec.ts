import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  startFakeModel,
  type FakeModel,
  type FakeRequest,
  type FakeTurn,
} from '../helpers/fake-model';
import { chooseTemplate, turnAiOff, turnAiOn } from './helpers/ai';
import { namedExternalLinkListItems } from '../../shared/external-link';
import sharp from 'sharp';
import { createOriginalAssetSettings } from '../../shared/asset-upload-settings';
import { buildUploadHeaders } from '../../shared/api/asset-upload-headers';
import { expectPopupUsable } from './helpers/popup';

/**
 * The AI in an entity's form: what waits for the entity is shown where the
 * form has its field — a value or a text edit at the field's label, which
 * turns accent with a ✦ that opens it, a tag or a relation among the form's
 * own — and accepted, it is laid into the form and counts as applied once
 * the form is saved. The ✦ of the
 * form starts a session about the entity, remembers something of it and
 * lists the sessions about it; the admin bar's ✦ starts one about the form
 * in hand. A change a session applies while the form is open is told to it.
 * The profile's form takes what is proposed for it the same way.
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
// Days of their own, far from the days other specs write.
const DAY = new Date(Date.UTC(2011, 0, 1) + (run % 700) * 86_400_000)
  .toISOString()
  .slice(0, 10);
const TITLE = `Ice walk ${run}`;
const NEW_TITLE = `Ice walk on the lake ${run}`;
const TAG = `Winter ${run}`;
const FACT = 'The route is no secret any more.';
const SLOGAN = `Walks on ice ${run}`;
const DESCRIPTION = `A frozen lake at dawn ${run}`;
const ASKED_SUMMARY = `A walk across the ice, ${run}`;
const BOTH_TITLE = `Frozen lake walk ${run}`;
const BOTH_SUMMARY = `Across the frozen lake and back, ${run}`;
let eventUuid = '';
/** A picture of the walk, for its description. */
let fileUuid = '';
let model: FakeModel;

const event = () => `event:${eventUuid}`;

/** The proposals the model makes, by a word of the owner's message. */
function proposals(said: string): Record<string, unknown>[] | undefined {
  // Two fields at once: one change, at the form's head.
  if (said.includes('both at once'))
    return [
      {
        kind: 'update',
        target: event(),
        changes: { title: BOTH_TITLE, summary: BOTH_SUMMARY },
        reason: 'Both, as asked.',
      },
    ];
  // Asked at the dates' ✦: all is well with them, nothing to propose.
  if (said.includes('the owner asks at its periods')) return undefined;
  // Asked at the summary's own ✦: its brief says more than the words.
  if (said.includes('the owner asks at its summary'))
    return [
      {
        kind: 'field',
        target: event(),
        field: 'summary',
        value: ASKED_SUMMARY,
        reason: 'Shorter.',
      },
    ];
  // Asked from the text's own editor: one edit of the text.
  if (said.includes('the owner asks at its text'))
    return [
      {
        kind: 'revise',
        target: event(),
        text: 'body',
        mode: 'proofread',
        reason: 'A pause.',
        corrections: [
          {
            find: 'walk across',
            replace: 'walk, across',
            category: 'punctuation',
            reason: 'A pause.',
          },
        ],
      },
    ];
  if (said.includes('describe the picture'))
    return [
      {
        kind: 'describe',
        file: fileUuid,
        text: DESCRIPTION,
        reason: 'What the picture shows.',
      },
    ];
  if (said.includes('everything'))
    return [
      {
        kind: 'field',
        target: event(),
        field: 'title',
        value: NEW_TITLE,
        certainty: 'unsure',
        reason: 'The title says where it was.',
      },
      {
        kind: 'tags',
        target: event(),
        add: [{ title: TAG }],
        reason: 'A walk of the winter.',
      },
      {
        kind: 'relation',
        target: event(),
        other: `diary-entry:${DAY}`,
        relation: 'related',
        whyNotInlineLink: 'The entry tells the day the walk came from.',
        reason: 'The diary tells how the walk was planned.',
      },
      {
        kind: 'remember',
        target: event(),
        about: 'entity',
        text: FACT,
        reason: 'You said so.',
      },
      {
        kind: 'revise',
        target: event(),
        text: 'body',
        mode: 'proofread',
        reason: 'A typo.',
        corrections: [
          {
            find: 'wierd',
            replace: 'weird',
            category: 'spelling',
            reason: 'A typo.',
          },
        ],
      },
    ];
  if (said.includes('summary'))
    return [
      {
        kind: 'field',
        target: event(),
        field: 'summary',
        value: 'A walk on the frozen lake.',
        reason: 'Shorter.',
      },
    ];
  if (said.includes('slogan'))
    return [
      {
        kind: 'field',
        target: 'profile',
        field: 'slogan',
        value: SLOGAN,
        reason: 'Your walks say who you are.',
      },
    ];
  if (said.includes('reminder'))
    return [
      {
        kind: 'field',
        target: event(),
        field: 'reminder',
        value: 'Add the photos.',
        reason: 'The photos are missing.',
      },
    ];
  return undefined;
}

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
  if (toolAnswered(request)) return { text: 'Proposed.' };
  if (lastOwnerWords(request).includes('slowly'))
    return {
      text: Array(40).fill('A walk is told word by word.').join(' '),
      delayMs: 150,
    };
  // Asked at the relations' heading: a long answer, nothing proposed.
  if (lastOwnerWords(request).includes('the owner asks at its relations'))
    return {
      text: 'No relation worth claiming: every other entry the text names is a mention, and a mention stays a link in the text.',
    };
  const actions = proposals(lastOwnerWords(request));
  if (!actions) return { text: 'Noted.' };
  return { toolCalls: [{ name: 'propose', input: { actions } }] };
}

test.beforeAll(async ({ request }) => {
  const diary = await (
    await request.post('/api/admin/diary', {
      data: {
        date: DAY,
        access: 'public',
        content: {
          data: {
            blocks: [{ type: 'paragraph', data: { text: 'Planned a walk.' } }],
          },
        },
      },
    })
  ).json();
  expect(diary.type, JSON.stringify(diary)).toBe('success');
  const made = await (
    await request.post('/api/admin/events', {
      data: {
        title: TITLE,
        summary: 'A walk.',
        access: 'public',
        humanReadableSlug: 'ice-walk',
        publicId: `iw${run}`,
        content: {
          data: {
            blocks: [
              {
                type: 'paragraph',
                data: { text: 'It was a wierd walk across the ice.' },
              },
            ],
          },
        },
        periods: [{ startDate: DAY, endDate: DAY }],
      },
    })
  ).json();
  expect(made.type, JSON.stringify(made)).toBe('success');
  eventUuid = made.eventUuid;
  const picture = await request.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension: 'png',
    }),
    data: await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        // A colour of this run alone: files are kept by their bytes, and a
        // picture of an earlier run would come back with its description.
        background: { r: run % 256, g: (run >> 8) % 256, b: run >> 16 },
      },
    })
      .png()
      .toBuffer(),
  });
  expect(picture.ok(), await picture.text()).toBe(true);
  fileUuid = (await picture.json()).assetUuid;

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

/** Asks the model in a new session; returns the session. */
async function ask(page: Page, words: string) {
  await open(page, '/admin/ai/?session=new');
  await page.locator('[data-composer-field]').click();
  await page.keyboard.type(words);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/ai\/\?session=ais-/);
  await expect(page.locator('[data-composer-stop]')).toHaveCount(0, {
    timeout: 40_000,
  });
  return new URL(page.url()).searchParams.get('session')!;
}

async function openForm(page: Page) {
  await open(page, `/admin/events/${eventUuid}/edit/`);
  await page.waitForLoadState('networkidle');
}

async function actionStates(page: Page, sessionUuid: string) {
  const detail = await (
    await page.request.get(`/api/admin/ai/sessions/${sessionUuid}`)
  ).json();
  return Object.fromEntries(
    detail.actions.map((action: { kind: string; state: string }) => [
      action.kind,
      action.state,
    ]),
  );
}

const save = (page: Page) =>
  page.getByRole('button', { name: /^(Save|Saved)$/ });

/**
 * The ✦ at a field's label while something is proposed for the field: with AI
 * on it stands there quiet otherwise, asking about the field.
 */
const star = (page: Page, place: string) =>
  page.locator(
    `[data-ai-field-offer="${place}"][data-ai-field-state="offers"]`,
  );

/** Opens what waits at a field from the ✦ at its label. */
async function fieldOffer(page: Page, place: string) {
  await star(page, place).click();
  const card = page.locator(
    `[data-floating-popup] [data-ai-offers="${place}"]`,
  );
  await expect(card).toBeVisible();
  return card;
}

let firstSession = '';

test('takes proposals into the form, applied once it is saved', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  firstSession = await ask(page, 'Propose everything for the walk');
  await openForm(page);
  await expect(page.locator('[data-ai-entity-count]')).toHaveText('5');

  // A value waits at its field's label, which turns accent; it goes into
  // the field, and the form is to be saved.
  await expect(
    page.locator('[data-field]', { has: star(page, 'field:title') }).first(),
  ).toBeVisible();
  const title = await fieldOffer(page, 'field:title');
  await expect(title).toContainText(NEW_TITLE);
  await expectPopupUsable(page, title);
  // In a form the value is put in its place, saved with the form.
  await expect(title.locator('[data-action-apply]')).toHaveText('Put in');
  await title.locator('[data-action-apply]').click();
  await expect(page.getByRole('textbox').first()).toHaveValue(NEW_TITLE);
  await expect(title).toHaveCount(0);
  await expect(star(page, 'field:title')).toHaveCount(0);
  await expect(page.locator('[data-toast]')).toContainText(
    /The\sform\schanged/,
  );
  await expect(save(page)).toHaveText('Save');

  // A tag and a relation are chips among the form's own; each opens its
  // proposal.
  const tagChip = page.locator(
    '[data-ai-offer-chips="tags"] [data-ai-offer-chip]',
  );
  await expect(tagChip).toContainText(TAG);
  await tagChip.click();
  const card = page.locator('[data-ai-offer-card]');
  await expectPopupUsable(page, card);
  await card.locator('[data-action-apply]').click();
  await expect(tagChip).toHaveCount(0);
  await expect(page.getByText(TAG, { exact: true })).toBeVisible();
  // The card of the last chip fades out before it goes.
  await expect(card).toHaveCount(0);

  const relationChip = page.locator(
    '[data-ai-offer-chips="relations"] [data-ai-offer-chip]',
  );
  await relationChip.click();
  await card.locator('[data-action-apply]').click();
  await expect(relationChip).toHaveCount(0);
  await expect(
    page.locator('[data-relations] [role="tab"]', { hasText: 'Diary' }),
  ).toContainText('1');

  // What the AI remembers is no part of the form: it is applied at once.
  const head = page.locator('[data-ai-offers="form"]');
  await expect(head).toContainText(FACT);
  await head.locator('[data-action-apply]').click();
  await expect(page.locator('[data-ai-memory-block]')).toContainText(FACT);

  // The text edit waits at its text's label, to be gone through in the
  // editor.
  // Its card says the correction itself, the old word and the new.
  await expect(await fieldOffer(page, 'text:event-body')).toContainText(
    'weird',
  );
  await page.keyboard.press('Escape');

  await save(page).click();
  await expect(save(page)).toHaveText('Saved');
  await expect
    .poll(() => actionStates(page, firstSession), { timeout: 10_000 })
    .toEqual({
      field: 'applied',
      tags: 'applied',
      relation: 'applied',
      remember: 'applied',
      revise: 'pending',
    });
  await expect(page.locator('[data-ai-entity-count]')).toHaveText('1');
});

test('a proposal changed back by hand is offered again', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const sessionUuid = await ask(page, 'Propose a summary');
  await openForm(page);
  const offer = await fieldOffer(page, 'field:summary');
  const summary = page.locator('textarea').first();
  const before = await summary.inputValue();
  await offer.locator('[data-action-apply]').click();
  await expect(offer).toHaveCount(0);
  await expect(summary).toHaveValue('A walk on the frozen lake.');
  // Corrected in the form, it is the owner's words now: the ✦ stays quiet.
  await summary.fill('A walk on the lake.');
  await expect(
    page.locator('[data-ai-field-offer="field:summary"]'),
  ).toHaveAttribute('data-ai-field-state', 'idle');
  // Changed back by hand, it is offered again.
  await summary.fill(before);
  await expect(star(page, 'field:summary')).toBeVisible();

  // Declined, it stays where it stood in its declined state: brought back
  // from there, then declined for good.
  const card = await fieldOffer(page, 'field:summary');
  await card.locator('[data-action-reject]').click();
  await expect(star(page, 'field:summary')).toHaveCount(0);
  await expect(card.locator('[data-action-restore]')).toBeVisible();
  await expect(page.locator('[data-toast]')).toBeHidden();
  // The way back takes no press in its first half second.
  await page.waitForTimeout(600);
  await card.locator('[data-action-restore]').click();
  await expect(star(page, 'field:summary')).toBeVisible();
  await expect(card.locator('[data-action-apply]')).toBeVisible();
  await page.waitForTimeout(600);
  await card.locator('[data-action-reject]').click();
  await card.locator('[data-action-never]').click();
  await expect
    .poll(async () => {
      const detail = await (
        await page.request.get(`/api/admin/ai/sessions/${sessionUuid}`)
      ).json();
      const action = detail.actions[0];
      return `${action.state}:${action.never}`;
    })
    .toBe('rejected:true');
});

test("opens a text edit from its text's label, in the editor", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openForm(page);
  await (
    await fieldOffer(page, 'text:event-body')
  )
    .locator('[data-action-open]')
    .click();
  const review = page.locator('[data-review]');
  await expect(review).toBeVisible({ timeout: 15_000 });
  await expect(review).toHaveAttribute('data-review-mode', 'ai');
  // It opens on what goes and what comes: the new word is the one marked in.
  await expect(review.locator('.review-mark ins')).toHaveText('weird');
});

test('the ✦ of a text’s editor asks about it, and its edit opens there', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openForm(page);
  await page.locator('button[data-field]').first().click();
  const editor = page.locator(
    'dialog .content-editor [contenteditable="true"]',
  );
  await expect(editor.first()).toBeVisible({ timeout: 15_000 });
  // Left of its history, the ✦ asks about the text in hand.
  await page.locator('[data-editor-ai]').click();
  const box = page.locator('[data-floating-popup] [data-editor-ai-ask]');
  await expect(box).toBeVisible();
  await expectPopupUsable(page, page.locator('[data-floating-popup]').last());
  await box.getByRole('button', { name: 'Check for mistakes' }).click();
  // What it proposes for the text opens on the comparison at once.
  const review = page.locator('[data-review]');
  await expect(review).toBeVisible({ timeout: 40_000 });
  await expect(review).toHaveAttribute('data-review-mode', 'ai');
  await expect(review.locator('.review-mark ins').first()).toContainText(
    'walk,',
  );
});

test('the ✦ of the form remembers, starts a session and lists them', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openForm(page);
  const button = page.locator('[data-ai-entity]');
  const menu = page.locator('[data-ai-entity-menu]');
  await button.click();
  await expectPopupUsable(page, menu);
  await expect(menu.locator('[data-session-link]')).not.toHaveCount(0);

  // Remembered from the menu, it shows in the memory block.
  await menu.locator('[data-ai-entity-remember]').click();
  const remember = page.locator('[data-remember-popup]');
  await remember.locator('[data-remember-text]').fill('Skates were rented.');
  await expectPopupUsable(page, remember);
  await remember.locator('[data-remember-save]').click();
  const block = page.locator('[data-ai-memory-block]');
  await expect(block).toContainText('Skates were rented.');

  // Forgotten, and brought back.
  const record = block
    .locator('[data-memory-record]')
    .filter({ hasText: 'Skates were rented.' });
  await record.locator('[data-memory-forget]').click();
  await expect(record).toHaveCount(0);
  await page
    .locator('[data-toast]')
    .getByRole('button', { name: 'Bring back' })
    .click();
  await expect(record).toBeVisible();

  // A new session about the event.
  await button.click();
  await menu.locator('[data-ai-entity-start]').click();
  await expect(page).toHaveURL(/session=new/);
  await expect(page).toHaveURL(new RegExp(`about=event(:|%3A)${eventUuid}`));
  await expect(page.locator('[data-session-new-about]')).toContainText(
    NEW_TITLE,
  );
  // The list shows the sessions about it only, until let go.
  await expect(page.locator('[data-session-about]')).toContainText(NEW_TITLE);

  // On a phone the menu fits.
  await page.setViewportSize(MOBILE);
  await openForm(page);
  await page.locator('[data-ai-entity]').click();
  await expectPopupUsable(page, menu);
});

test('the ✦ sends a ready-made request about the entity, and the form stays', async ({
  page,
}) => {
  const preset = (await (
    await page.request.post('/api/admin/ai/templates', {
      data: {
        title: `Look over ${run}`,
        instruction: 'Look over this one and say what you think.',
      },
    })
  ).json()) as { templateId: string };
  try {
    for (const size of [MOBILE, DESKTOP]) {
      await page.setViewportSize(size);
      await openForm(page);
      const form = page.url();
      await page.locator('[data-ai-entity]').click();
      const menu = page.locator('[data-ai-entity-menu]');
      await expectPopupUsable(page, menu);
      // The message names the entity before a word is written.
      const composer = menu.locator('[data-ai-entity-composer]');
      await expect(composer.locator('[data-mention]')).toContainText(NEW_TITLE);
      await chooseTemplate(menu, preset.templateId);
      await expect(composer).toContainText('Look over this one');
      await composer.locator('[contenteditable="true"]').press('End');
      await page.keyboard.type(' Briefly.');
      await menu.getByRole('button', { name: /send/i }).click();
      const sent = menu.locator('[data-ai-entity-sent]');
      await expect(sent).toBeVisible();
      await expect(sent).toContainText(`Look over ${run}`);
      expect(page.url()).toBe(form);
      // The field is ready for the next message, about the entity again.
      await expect(composer.locator('[data-mention]')).toHaveCount(1);
      await page.keyboard.press('Escape');
    }
    const sessions = (await (
      await page.request.get(
        `/api/admin/ai/sessions?about=${encodeURIComponent(event())}`,
      )
    ).json()) as { sessions: { templateId: string | null; origin: string }[] };
    expect(
      sessions.sessions.filter(
        (session) => session.templateId === preset.templateId,
      ),
    ).toHaveLength(2);
    expect(sessions.sessions[0]!.origin).toBe('owner');
  } finally {
    await page.request.delete(`/api/admin/ai/templates/${preset.templateId}`);
  }
});

test('a ready-made request takes the place of the one before, and Ctrl+Z brings it back', async ({
  page,
}) => {
  const preset = async (title: string, instruction: string) =>
    (await (
      await page.request.post('/api/admin/ai/templates', {
        data: { title, instruction },
      })
    ).json()) as { templateId: string };
  const first = await preset(`First ${run}`, 'Look over the first part.');
  const second = await preset(`Second ${run}`, 'Look over the second part.');
  try {
    await page.setViewportSize(DESKTOP);
    await openForm(page);
    await page.locator('[data-ai-entity]').click();
    const menu = page.locator('[data-ai-entity-menu]');
    const composer = menu.locator('[data-ai-entity-composer]');
    const field = composer.locator('[contenteditable="true"]');
    await field.press('End');
    await page.keyboard.type(' My own words.');
    await chooseTemplate(menu, first.templateId);
    await expect(field).toContainText('Look over the first part.');
    // The next takes its place; the owner's words and the chip stay.
    await chooseTemplate(menu, second.templateId);
    await expect(field).toContainText('Look over the second part.');
    await expect(field).not.toContainText('the first part');
    await expect(field).toContainText('My own words.');
    await expect(composer.locator('[data-mention]')).toHaveCount(1);
    // One step back is the request before, as it was put in.
    await field.focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(field).toContainText('Look over the first part.');
    await expect(field).not.toContainText('the second part');
    await expect(field).toContainText('My own words.');
  } finally {
    for (const { templateId } of [first, second])
      await page.request.delete(`/api/admin/ai/templates/${templateId}`);
  }
});

test('the ✦ stops the session it sent while it answers', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await openForm(page);
  await page.locator('[data-ai-entity]').click();
  const menu = page.locator('[data-ai-entity-menu]');
  const composer = menu.locator('[data-ai-entity-composer]');
  await composer.locator('[contenteditable="true"]').press('End');
  await page.keyboard.type(' Tell it slowly.');
  await page.keyboard.press('Enter');
  const sent = menu.locator('[data-ai-entity-sent]');
  const stop = sent.locator('[data-ai-entity-stop]');
  await expect(stop).toBeVisible();
  const sessionUuid = new URL(
    (await sent.locator('a').getAttribute('href'))!,
    page.url(),
  ).searchParams.get('session')!;
  await stop.click();
  await expect(stop).toHaveCount(0);
  const detail = (await (
    await page.request.get(`/api/admin/ai/sessions/${sessionUuid}`)
  ).json()) as {
    session: { state: string };
    messages: { role: string; parts: { type: string; kind?: string }[] }[];
  };
  expect(detail.session.state).toBe('idle');
  expect(
    detail.messages
      .filter((message) => message.role === 'model')
      .at(-1)!
      .parts.find((part) => part.type === 'notice')?.kind,
  ).toBe('stopped');
  await page.keyboard.press('Escape');
});

test('a ready-made request opens in a new session from its row', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const preset = (await (
    await page.request.post('/api/admin/ai/templates', {
      data: {
        title: `Row request ${run}`,
        instruction: 'Write me a short plan.',
      },
    })
  ).json()) as { templateId: string };
  try {
    await open(page, '/admin/ai/?tab=templates');
    const row = page.locator(
      `[data-templates-list] [data-template-row="${preset.templateId}"]`,
    );
    await expect(row).toContainText('Write me a short plan.');
    await row.locator('[data-template-open]').click();
    await expect(page).toHaveURL(/session=new/);
    await expect(page).not.toHaveURL(/template=/);
    const composer = page.locator('[data-session-new-screen] [data-composer]');
    await expect(composer).toContainText('Write me a short plan.');
    // The picker says which template the words began from.
    await expect(
      page.locator('[data-session-new-screen] [data-ai-presets]'),
    ).toContainText(`Row request ${run}`);
  } finally {
    await page.request.delete(`/api/admin/ai/templates/${preset.templateId}`);
  }
});

test('the admin bar starts a session about the form in hand', async ({
  page,
}) => {
  for (const size of [DESKTOP, MOBILE]) {
    await page.setViewportSize(size);
    await openForm(page);
    await page.locator('[data-ai-bar]').click();
    const menu = page.locator('[data-ai-bar-menu]');
    await expectPopupUsable(page, menu);
    await expect(menu.locator('[data-ai-bar-start]')).toContainText(NEW_TITLE);
  }
  await page.locator('[data-ai-bar-menu] [data-ai-bar-start]').click();
  await expect(page).toHaveURL(new RegExp(`about=event(:|%3A)${eventUuid}`));
});

test('a change a session applies is told to the open form', async ({
  context,
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const other = await context.newPage();
  const sessionUuid = await ask(other, 'Propose a reminder');
  await openForm(page);
  await expect(star(page, 'field:reminder')).toBeVisible();

  // Applied from the session in the other tab.
  await other.locator('[data-action-apply]').first().click();
  await expect
    .poll(() => actionStates(other, sessionUuid))
    .toEqual({ field: 'applied' });
  await expect(page.locator('[data-ai-outdated]')).toBeVisible();
  await expect(star(page, 'field:reminder')).toHaveCount(0);
  await other.close();
});

test('proposals fit a phone', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await openForm(page);
  await expectPopupUsable(page, await fieldOffer(page, 'text:event-body'));
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test('the profile takes what is proposed for it', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const profile = async () =>
    (await (await page.request.get('/api/admin/about')).json()).data;
  const before = (await profile()).slogan;
  const sessionUuid = await ask(page, 'Propose a slogan');
  await open(page, '/admin/about/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-ai-entity-count]')).toHaveText('1');

  const offer = await fieldOffer(page, 'field:slogan');
  await expect(offer).toContainText(SLOGAN);
  await offer.locator('[data-action-apply]').click();
  await expect(star(page, 'field:slogan')).toHaveCount(0);
  await save(page).click();
  await expect(save(page)).toHaveText('Saved');
  expect((await profile()).slogan).toBe(SLOGAN);
  await expect
    .poll(() => actionStates(page, sessionUuid), { timeout: 10_000 })
    .toEqual({ field: 'applied' });

  // What is kept of the owner is «about you»: the profile's ✦ remembers
  // nothing itself, but starts a session about it.
  await page.locator('[data-ai-entity]').click();
  await expect(page.locator('[data-ai-entity-menu]')).toBeVisible();
  await expect(page.locator('[data-ai-entity-remember]')).toHaveCount(0);
  await expect(page.locator('[data-ai-entity-start]')).toBeVisible();

  const data = await profile();
  expect(
    (
      await page.request.put('/api/admin/about', {
        data: {
          ...data,
          externalLinks: namedExternalLinkListItems(data.externalLinks),
          slogan: before,
        },
      })
    ).ok(),
  ).toBe(true);
});

test('a file’s description waits at its label in the file’s window', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const sessionUuid = await ask(page, 'Describe the picture of the walk');
  await open(page, '/admin/assets/');
  await expect(page.locator('[data-admin-assets-ready]')).toHaveAttribute(
    'data-admin-assets-ready',
    'true',
  );
  await page.locator(`[data-asset-uuid="${fileUuid}"]`).first().click();
  const input = page.locator('[data-file-description-input]');
  await expect(input).toHaveValue('');

  // The proposal waits at the label: the words it would write, compared
  // with none.
  const offer = await fieldOffer(page, 'field:description');
  await expect(offer.locator('[data-action-description]')).toHaveText(
    DESCRIPTION,
  );
  await expectPopupUsable(page, offer);
  await offer.locator('[data-action-apply]').click();
  await expect(input).toHaveValue(DESCRIPTION);
  // Taken into the field, it is applied once the field is saved — with the
  // owner's words, corrected there before saving.
  expect(await actionStates(page, sessionUuid)).toEqual({
    describe: 'pending',
  });
  await input.fill(`${DESCRIPTION}, the ice still grey`);
  await page.locator('[data-file-description-save]').click();
  await expect(page.locator('[data-file-description-notice]')).toHaveText(
    'File description saved',
  );
  await expect
    .poll(() => actionStates(page, sessionUuid))
    .toEqual({ describe: 'applied' });
  await expect(star(page, 'field:description')).toHaveCount(0);
  const detail = await (
    await page.request.get(`/api/admin/ai/sessions/${sessionUuid}`)
  ).json();
  expect(detail.actions[0]).toMatchObject({
    payload: { text: `${DESCRIPTION}, the ice still grey` },
    proposed: { text: DESCRIPTION },
  });
});

test('a field’s quiet ✦ asks about the field, and its proposal comes there', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openForm(page);
  const quiet = page.locator('[data-ai-field-offer="field:summary"]');
  await expect(quiet).toHaveAttribute('data-ai-field-state', 'idle');
  // A switch's ✦ only brings what was proposed.
  await expect(page.locator('[data-ai-field-offer="access"]')).toHaveCount(0);
  await quiet.click();
  const box = page.locator(
    '[data-floating-popup] [data-ai-field-ask="field:summary"]',
  );
  await expectPopupUsable(page, box);
  await box.getByRole('button', { name: 'Make it shorter' }).click();
  // Answered in the background, the proposal takes the box's place.
  const card = page.locator(
    '[data-floating-popup] [data-ai-offers="field:summary"]',
  );
  await expect(card).toBeVisible({ timeout: 40_000 });
  // Said word by word over the summary it adds to: the words it brings.
  await expect(card.locator('[data-change="added"]')).toContainText(
    `across the ice, ${run}`,
  );
  await expect(star(page, 'field:summary')).toBeVisible();
  // Left as it came: declined, the ✦ is quiet again.
  await card.locator('[data-action-reject]').click();
  await expect(quiet).toHaveAttribute('data-ai-field-state', 'idle');
});

test('a field’s ✦ offers what can find something, and an empty answer stays by it', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openForm(page);
  // The notes hold nothing: nothing to check or mend is offered for them.
  const notes = page.locator('[data-ai-field-offer$="-notes"]');
  await notes.click();
  const notesBox = page.locator(
    '[data-floating-popup] [data-ai-field-ask$="-notes"]',
  );
  await expect(notesBox).toBeVisible();
  await expect(
    notesBox.getByRole('button', { name: 'Check for mistakes' }),
  ).toHaveCount(0);
  await expect(notesBox.locator('textarea')).toBeVisible();
  await expect(notesBox.locator('[data-ai-field-empty]')).toHaveText(
    /^Nothing\shere\syet\sto\scheck\.\sAsk\sin\syour\sown\swords$/,
  );
  // Words past what the ask takes are said to be, never cut and sent.
  await notesBox.locator('textarea').fill('a'.repeat(2001));
  await expect(notesBox.locator('[data-comment-too-long]')).toHaveText(
    'At most 2000 characters',
  );
  await expect(notesBox.locator('[data-comment-send]')).toBeDisabled();
  await notesBox.locator('textarea').fill('');
  await expect(notesBox.locator('[data-comment-too-long]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(notesBox).toBeHidden();

  // The dates are there to check; the model finds nothing to change.
  const dates = page.locator('[data-ai-field-offer="periods"]');
  await dates.click();
  const box = page.locator(
    '[data-floating-popup] [data-ai-field-ask="periods"]',
  );
  await box.getByRole('button', { name: 'Check the dates' }).click();
  // The box goes with the answer, which stays beside the ✦ in its words.
  const said = page.locator('[data-ai-field-said]');
  await expect(said).toHaveText('Noted.', { timeout: 40_000 });
  await expect(box).toBeHidden();
  await expect(dates).toHaveAttribute('data-ai-field-state', 'idle');
  await expect(said).toHaveAttribute(
    'aria-label',
    'Answered, proposing nothing: Noted.',
  );
  // A tap on it opens the box again, with the whole answer.
  await said.click();
  await expect(box.locator('[data-ai-field-answered]')).toContainText('Noted.');
  await page.keyboard.press('Escape');

  // On a phone a long answer at a list's heading keeps to the screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[data-ai-field-offer="relations"]').click();
  await page
    .locator('[data-floating-popup] [data-ai-field-ask="relations"]')
    .getByRole('button', { name: 'Find relations' })
    .click();
  await expect(
    page.locator('[data-ai-field-said]', { hasText: 'No relation worth' }),
  ).toBeVisible({ timeout: 40_000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('a change taken at the form’s head stays there until the form is saved', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await ask(page, 'Rename it and its gist both at once');
  await openForm(page);
  const head = page.locator('[data-ai-offers="form"]');
  const title = page.getByRole('textbox').first();
  const before = await title.inputValue();
  await expect(head.locator('[data-action-apply]')).toHaveText('Put in');
  await head.locator('[data-action-apply]').click();
  await expect(title).toHaveValue(BOTH_TITLE);
  // Its row stays where it stood, says it is in the form, and takes it back
  // from there: the form under it never moves.
  await expect(head.locator('[data-action-taken]')).toBeVisible();
  await expect(page.locator('[data-toast]')).toBeHidden();
  await page.waitForTimeout(600);
  await head.locator('[data-action-take-back]').click();
  await expect(title).toHaveValue(before);
  await expect(head.locator('[data-action-apply]')).toBeVisible();
  // Declined, it stays too, to be brought back.
  await page.waitForTimeout(600);
  await head.locator('[data-action-reject]').click();
  await expect(head.locator('[data-action-restore]')).toBeVisible();
});
