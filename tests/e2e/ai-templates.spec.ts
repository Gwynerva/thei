import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { startFakeModel, type FakeModel } from '../helpers/fake-model';
import { expectPopupUsable } from './helpers/popup';

/**
 * The Templates tab as the owner uses it: the built-in templates switched
 * on and off from their rows, one of the owner's own written — a request,
 * a weekly schedule — run at once into a session of its own, a built-in one
 * copied, and an own one deleted, its sessions kept. On a computer, and on
 * a phone.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const run = Date.now() % 100_000;
const TITLE = `Harbour week ${run}`;
let model: FakeModel;

test.beforeAll(async ({ request }) => {
  model = await startFakeModel(
    () => ({ text: 'Read the week: all is well.' }),
    {
      models: ['fake-e2e'],
    },
  );
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
  const list = (await (
    await request.get('/api/admin/ai/templates')
  ).json()) as {
    templates: { templateId: string; builtin?: string; title: string }[];
  };
  for (const template of list.templates)
    if (template.builtin)
      await request.patch(`/api/admin/ai/templates/${template.templateId}`, {
        data: { enabled: false },
      });
    else if (template.title.includes(String(run)))
      await request.delete(`/api/admin/ai/templates/${template.templateId}`);
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

async function open(page: Page) {
  await page.goto('/admin/ai/?tab=templates');
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await expect(page.locator('[data-templates-panel]')).toBeVisible();
}

const nightly = (page: Page) =>
  page.locator('[data-template-row="builtin-nightly"]');

/** The popup of the select of when a template runs, while it is open. */
const whenPopup = (page: Page) =>
  page.locator('[data-floating-popup]').filter({
    has: page.locator('[data-select-popup]'),
  });

test('switches a built-in schedule from its row', async ({ page }) => {
  await open(page);
  const toggle = nightly(page).getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(nightly(page)).toContainText('schedule off');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(nightly(page)).toContainText('next ');
  await open(page);
  await expect(nightly(page).getByRole('switch')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('keeps a built-in request as written, and copies it off', async ({
  page,
}) => {
  await open(page);
  await nightly(page).locator('[data-template-edit]').click();
  const modal = page.locator('[data-template-modal]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('[data-template-instruction]')).toHaveCount(0);
  await expect(modal.locator('[data-template-title]')).toHaveCount(0);
  await modal.locator('[data-template-copy]').click();
  await expect(modal).toHaveCount(0);
  const copy = page
    .locator('[data-templates-own] [data-template-row]')
    .filter({ hasText: '(copy)' })
    .first();
  await expect(copy).toBeVisible();
  await expect(copy).toContainText('schedule off');
  // A copy is the owner's own: it is deleted, unlike a built-in one.
  await copy.locator('[data-template-edit]').click();
  page.once('dialog', (dialog) => void dialog.accept());
  await modal.locator('[data-template-delete]').click();
  await expect(modal).toHaveCount(0);
});

test('writes a template of its own and runs it into a session', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.locator('[data-template-new]').click();
  const modal = page.locator('[data-template-modal]');
  const save = modal.locator('[data-template-save]');
  await expect(save).toBeDisabled();
  await modal.locator('[data-template-title]').fill(TITLE);
  await modal
    .locator('[data-template-instruction]')
    .fill('Read the diary entries of the last week and proofread them.');

  // When it runs is chosen in a popup inside the modal, each way saying what
  // it means; the keyboard walks it as it would a select.
  const when = modal.locator('[data-template-when]');
  await expect(when).toHaveAccessibleName('When: By hand');
  await when.click();
  await expectPopupUsable(page, whenPopup(page));
  await expect(
    whenPopup(page).locator('[data-select-option="week"]'),
  ).toContainText('On the day and at the hour chosen');
  await page.keyboard.press('Escape');
  await expect(whenPopup(page)).toHaveCount(0);
  await expect(when).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const manual = whenPopup(page).locator('[data-select-option="manual"]');
  await expect(manual).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(
    whenPopup(page).locator('[data-select-option="week"]'),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(when).toHaveAccessibleName('When: Every week');
  await expect(when).toBeFocused();
  await modal.locator('[data-template-day="3"]').click();
  await modal.locator('[data-template-time]').fill('10:30');
  await save.click();
  await expect(modal).toHaveCount(0);

  const row = page
    .locator('[data-templates-own] [data-template-row]')
    .filter({ hasText: TITLE });
  await expect(row).toContainText('Every Wed, 10:30');
  await expect(row).toContainText('not run yet');

  await row.locator('[data-template-run]').click();
  await page.locator('[data-toast] button').click();
  await expect(page).toHaveURL(/[?&]session=/);
  const note = page.locator('[data-message]').first();
  await expect(note).toContainText(TITLE);
  await expect(note).toContainText('started by you');
  await expect(page.locator('[data-message-role="model"]')).toContainText(
    'all is well',
    { timeout: 20_000 },
  );
  // The model was told its request, and which day it is for the owner.
  const asked = JSON.stringify(model.requests.at(-1)!.body.messages);
  expect(asked).toContain('Read the diary entries of the last week');
  expect(asked).toContain('in the owner’s time zone');
  expect(asked).toContain('list_entities with its kind, from and to');
});

test('lists the sessions a template started, and deletes it', async ({
  page,
}) => {
  await open(page);
  const row = page
    .locator('[data-templates-own] [data-template-row]')
    .filter({ hasText: TITLE });
  await expect(row.locator('[data-template-last]')).toBeVisible();
  await row.locator('[data-template-edit]').click();
  const modal = page.locator('[data-template-modal]');
  await expect(modal.locator('[data-template-sessions] li')).toHaveCount(1);
  page.once('dialog', (dialog) => void dialog.accept());
  await modal.locator('[data-template-delete]').click();
  await expect(row).toHaveCount(0);
});

test('fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await expect(nightly(page).locator('[data-template-run]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await nightly(page).locator('[data-template-edit]').click();
  await expect(page.locator('[data-template-modal]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator('[data-template-modal] [data-template-when]').click();
  await expectPopupUsable(page, whenPopup(page));
});
