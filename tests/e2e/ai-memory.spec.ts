import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { expectPopupUsable } from './helpers/popup';

/**
 * The Memory tab as the owner uses it: their own words that every session
 * reads, the dictionary — a word added, refused twice, changed, let go and
 * brought back — what is kept about a whole kind, and about entities, each
 * opening in place with what it is remembered by. A search narrows it all.
 * On a computer, and on a phone.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const run = Date.now() % 100_000;
const PROJECT_TITLE = `Lighthouse keeper ${run}`;
const WORD = `Kuzova${run}`;
let projectUuid = '';
let factUuid = '';
let neverUuid = '';
let kindUuid = '';
let instructions = '';

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

test.beforeAll(async ({ request }) => {
  const project = await (
    await request.post('/api/admin/projects', {
      data: {
        title: PROJECT_TITLE,
        summary: 'A keeper.',
        access: 'public',
        humanReadableSlug: 'lighthouse-keeper',
        publicId: `lk${run}`,
        showcase: false,
        cv: false,
        descriptionContent: content('A lighthouse.'),
        relations: [],
      },
    })
  ).json();
  expect(project.type, JSON.stringify(project)).toBe('success');
  projectUuid = project.projectUuid;

  const settings = await (await request.get('/api/admin/ai/settings')).json();
  instructions = settings.instructions ?? '';
  expect(
    (
      await request.put('/api/admin/ai/settings', { data: { enabled: true } })
    ).ok(),
  ).toBe(true);

  const remember = async (data: Record<string, unknown>) => {
    const response = await request.post('/api/admin/ai/memory', { data });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).memoryUuid as string;
  };
  factUuid = await remember({
    anchor: 'entity',
    ref: `project:${projectUuid}`,
    text: `The keeper of ${run} lived by the sea.`,
  });
  neverUuid = await remember({
    anchor: 'entity',
    ref: `project:${projectUuid}`,
    type: 'never',
    text: 'Never offer the tag «autumn».',
  });
  kindUuid = await remember({
    anchor: 'kind',
    kind: 'diary-entry',
    type: 'never',
    text: `Offer no tags ${run}.`,
  });
});

test.afterAll(async ({ request }) => {
  for (const uuid of [factUuid, neverUuid, kindUuid])
    await request.delete(`/api/admin/ai/memory/${uuid}`);
  await request.put('/api/admin/ai/settings', {
    data: { instructions, enabled: false },
  });
});

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page) {
  await page.goto('/admin/ai/?tab=memory');
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await expect(page.locator('[data-ai-memory]')).toBeVisible();
}

test('keeps what the owner says about themselves', async ({ page }) => {
  await open(page);
  const field = page.locator('[data-ai-instructions]');
  const save = page.locator('[data-ai-instructions-save]');
  await field.fill('I write in the first person.');
  await expect(page.locator('[data-ai-memory]')).toContainText(
    '28 of 1500 characters',
  );
  await save.click();
  await expect(save).toBeDisabled();
  await open(page);
  await expect(field).toHaveValue('I write in the first person.');
});

test('adds, changes and lets go of a word of the dictionary', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const popup = page.locator('[data-term-popup]');
  const save = popup.locator('[data-term-save]');

  // Added from the section's «+», all of it at once.
  await page.locator('[data-term-add]').click();
  await expectPopupUsable(page, popup);
  await popup.locator('[data-term-word]').fill(WORD);
  await popup.locator('[data-term-note]').fill('Islands in a cold sea');
  await popup.locator('[data-term-forms]').fill(`on ${WORD}, to ${WORD}`);
  await save.click();
  await expect(popup).toHaveCount(0);
  const row = page.locator(`[data-term="${WORD.toLowerCase()}"]`);
  await expect(row).toContainText('Keep as written');
  await expect(row).toContainText('Islands in a cold sea');
  await expect(row).toContainText(`on ${WORD}, to ${WORD}`);

  // The same word again is there already, in any case.
  await page.locator('[data-term-add]').click();
  await popup.locator('[data-term-word]').fill(WORD.toUpperCase());
  await expect(popup.locator('[data-term-taken]')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);

  // Changed in the same popup, opened with its values.
  await row.locator('[data-term-edit]').click();
  await expectPopupUsable(page, popup);
  await expect(popup.locator('[data-term-word]')).toHaveValue(WORD);
  await popup.locator('[data-term-keep]').getByRole('switch').click();
  await save.click();
  await expect(popup).toHaveCount(0);
  await expect(row).not.toContainText('Keep as written');

  // Let go and brought back; let go again, it is gone for good.
  await row.locator('[data-term-remove]').click();
  await expect(row).toHaveCount(0);
  await page.locator('[data-toast] button').click();
  await expect(row).toBeVisible();
  await row.locator('[data-term-remove]').click();
  await expect(row).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          (await (await request.get('/api/admin/ai/memory')).json()) as {
            terms: { word: string }[];
          }
        ).terms.some((term) => term.word === WORD.toLowerCase()),
      { timeout: 15_000 },
    )
    .toBe(false);
});

test('opens an entity in place, with what is kept about it', async ({
  page,
}) => {
  await open(page);
  const group = page.locator(`[data-memory-entity="project:${projectUuid}"]`);
  const toggle = group.locator('button').first();
  await expect(toggle).toContainText(PROJECT_TITLE);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // A fact is said anew in place; a «never» is only let go.
  const fact = group.locator(`[data-memory-record="${factUuid}"]`);
  const never = group.locator(`[data-memory-record="${neverUuid}"]`);
  await expect(never.locator('[data-memory-edit]')).toHaveCount(0);
  await fact.locator('[data-memory-edit]').click();
  await fact
    .locator('[data-memory-edit-text]')
    .fill(`The keeper of ${run} lived at the lighthouse.`);
  await fact.locator('[data-memory-edit-save]').click();
  await expect(fact).toContainText('lived at the lighthouse');

  // Its own form is a click away.
  await group.getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/projects/${projectUuid}/`));
});

test('narrows everything to what a search finds', async ({ page }) => {
  await open(page);
  await page.locator('[data-memory-search]').fill(`keeper of ${run}`);
  await expect(page.locator('[data-memory-entity]')).toHaveCount(1);
  await expect(
    page.locator(`[data-memory-entity="project:${projectUuid}"]`),
  ).toBeVisible();
  await expect(page.locator('[data-memory-terms]')).toHaveCount(0);
  await expect(page.locator('[data-memory-kinds]')).toHaveCount(0);

  await page.locator('[data-memory-search]').fill(`no tags ${run}`);
  await expect(page.locator('[data-memory-kinds]')).toContainText(
    'All diary entries',
  );
  await expect(page.locator('[data-memory-entities]')).toHaveCount(0);
});

test('fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.locator('[data-term-add]').click();
  await expectPopupUsable(page, page.locator('[data-term-popup]'));
  await page.keyboard.press('Escape');
  const group = page.locator(`[data-memory-entity="project:${projectUuid}"]`);
  await group.locator('button').first().click();
  await expect(
    group.locator(`[data-memory-record="${factUuid}"]`),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
