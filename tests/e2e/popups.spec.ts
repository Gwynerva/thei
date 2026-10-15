import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { expectPopupUsable } from './helpers/popup';

/**
 * Popups where people meet them: in the content editor and in the relation
 * modal — both `<dialog>`s in the top layer, which a popup has to join to be
 * seen — and on a form page, near its bottom edge too. Each must open whole,
 * on top, and usable, on a computer and on a phone.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const SIZES = [
  ['computer', { width: 1280, height: 800 }],
  ['phone', { width: 375, height: 812 }],
] as const;

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

async function createProject(page: Page) {
  const stamp = Date.now();
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Popups ${stamp}`,
      summary: 'A project for the popup spec.',
      access: 'public',
      humanReadableSlug: 'popups',
      publicId: `pop${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: content('A description to open in the editor.'),
      relations: [],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body.projectUuid as string;
}

async function openForm(page: Page, projectUuid: string) {
  await page.goto(`/admin/projects/${projectUuid}/edit/`);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

/** The popup that is open now: closed ones leave nothing behind. */
const openPopup = (page: Page) =>
  page.locator('[data-floating-popup]').filter({ visible: true }).last();

for (const [name, size] of SIZES) {
  test(`the editor's history opens on top of the editor (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openForm(page, await createProject(page));
    await page.locator('button[data-field]').first().click();
    await expect(
      page.locator('dialog .content-editor [contenteditable="true"]').first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Version history' }).click();
    await expect(page.locator('[data-content-history-panel]')).toBeVisible();
    await expectPopupUsable(page, openPopup(page));
  });

  test(`the relation picker opens inside its modal (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openForm(page, await createProject(page));
    await page
      .getByRole('button', { name: 'Add a relation', exact: true })
      .click();
    await expect(page.locator('[data-relation-modal]')).toBeVisible();
    await expect(
      page.locator('section[role="dialog"]').getByRole('combobox'),
    ).toBeFocused();
    await expectPopupUsable(page, openPopup(page));
  });

  test(`the tag list opens beside its field, at the bottom edge too (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openForm(page, await createProject(page));
    const field = page.getByRole('combobox', { name: 'Add tag…' });

    await field.scrollIntoViewIfNeeded();
    await field.fill('a');
    await expectPopupUsable(page, openPopup(page));
    await page.keyboard.press('Escape');

    // Brought to the very bottom of the screen, the list turns upward.
    await field.evaluate((element) =>
      element.scrollIntoView({ block: 'end' }),
    );
    await field.fill('');
    await field.fill('b');
    await expectPopupUsable(page, openPopup(page));
  });
}
