import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Adding one file to a project — to its showcase or to its other files —
 * goes from the editor on to the file's details, where its caption or its
 * title is written: whether the file was used as it is, made into a variant,
 * or a duplicate settled by choosing one of the variants already stored.
 * What is typed there ends by the rule for captions and headings.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** A picture no run has stored before: its first pixels are random. */
async function picture() {
  const pixels = Buffer.alloc(160 * 120 * 3, 140);
  randomBytes(64).copy(pixels);
  return await sharp(pixels, { raw: { width: 160, height: 120, channels: 3 } })
    .png()
    .toBuffer();
}

async function createProject(page: Page, stamp: number) {
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Files ${stamp}`,
      summary: 'A project with files.',
      access: 'public',
      humanReadableSlug: 'files',
      publicId: `files${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: {
        data: { blocks: [{ type: 'paragraph', data: { text: 'Files.' } }] },
      },
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body.projectUuid as string;
}

async function openEditForm(page: Page, projectUuid: string) {
  await page.goto(`/admin/projects/${projectUuid}/edit/`);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

async function pick(page: Page, add: string, name: string, buffer: Buffer) {
  await page.getByRole('button', { name: add, exact: true }).click();
  await page
    .locator('dialog[open] input[type=file]')
    .setInputFiles({ name, mimeType: 'image/png', buffer });
}

const modal = (page: Page) => page.locator('dialog[open]').last();
const openModals = (page: Page) => page.locator('dialog[open]');

/** The editor's "Use as is", in the section of the file as it was picked. */
async function useAsIs(page: Page) {
  await modal(page)
    .getByRole('button', { name: 'Selected file', exact: true })
    .click();
  await modal(page)
    .getByRole('button', { name: 'Use as is', exact: true })
    .click();
}

async function saveProject(page: Page, projectUuid: string) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Saved', exact: true }),
  ).toBeVisible();
  const response = await page.request.get(`/api/admin/projects/${projectUuid}`);
  return await response.json();
}

test('a picture added to the showcase goes on to its caption', async ({
  page,
}) => {
  const projectUuid = await createProject(page, Date.now());
  await openEditForm(page, projectUuid);

  await pick(page, 'Add to Showcase', 'cat.png', await picture());
  await useAsIs(page);

  // The editor hands over to the details instead of closing the flow.
  const caption = modal(page).getByPlaceholder('Caption');
  await expect(caption).toBeVisible({ timeout: 20_000 });
  await caption.fill('Кот на окне.');
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(openModals(page)).toHaveCount(0);

  // One sentence takes no full stop.
  await expect(page.getByText('Кот на окне', { exact: true })).toBeVisible();
  const saved = await saveProject(page, projectUuid);
  expect(saved.showcaseAssets).toHaveLength(1);
  expect(saved.showcaseAssets[0].caption).toBe('Кот на окне');
});

test('a duplicate settled by its variant goes on to its title, and Back leaves it placed', async ({
  page,
}) => {
  const projectUuid = await createProject(page, Date.now());
  await openEditForm(page, projectUuid);
  const buffer = await picture();

  // Stored once, through the showcase.
  await pick(page, 'Add to Showcase', 'first.png', buffer);
  await useAsIs(page);
  await expect(modal(page).getByPlaceholder('Caption')).toBeVisible({
    timeout: 20_000,
  });
  await page.keyboard.press('Escape');
  await expect(openModals(page)).toHaveCount(0);

  // The same bytes again, as another file: a duplicate, settled by choosing
  // the variant already stored.
  await pick(page, 'Add File', 'again.png', buffer);
  const choose = modal(page).getByRole('button', {
    name: 'Choose this variant',
    exact: true,
  });
  await expect(choose).toBeEnabled({ timeout: 20_000 });
  await choose.click();

  const title = modal(page).getByPlaceholder('Title');
  await expect(title).toBeVisible({ timeout: 20_000 });
  const url = page.url();
  await page.goBack();
  await expect(openModals(page)).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(
    page.getByRole('button', { name: 'File Details', exact: true }),
  ).toHaveCount(1);

  // Opened again, the details take a title and a description.
  await page.getByRole('button', { name: 'File Details', exact: true }).click();
  await expect(title).toBeVisible();
  await title.fill('Отчёт за год.');
  await modal(page).getByPlaceholder('Description').fill('Итоги. Планы');
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(openModals(page)).toHaveCount(0);

  const saved = await saveProject(page, projectUuid);
  expect(saved.otherAssets).toHaveLength(1);
  expect(saved.otherAssets[0]).toMatchObject({
    title: 'Отчёт за год',
    caption: 'Итоги. Планы.',
  });
});
