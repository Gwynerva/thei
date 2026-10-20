import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { uploadFile } from './helpers/upload';

/**
 * «Saved» says that something is stored: a text's editor says it of a text
 * stored as it stands there, a section's modal of a section the project has
 * stored as it was handed over. What is only taken into a form that waits on
 * something else is not called saved; and what is no change of the text —
 * a recording's volume slid — never turns the editor's Save.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const DESKTOP = { width: 1280, height: 800 };

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

/** A private page holding these blocks: its uuid and title. */
async function createPage(page: Page, blocks: object[]) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const title = `Save state ${stamp}`;
  const result = await (
    await page.request.post('/api/admin/pages', {
      data: {
        title,
        summary: 'A page for the save state spec.',
        slug: `save-state-${stamp}`,
        access: 'private',
        content: { data: { blocks } },
        reminder: '',
        notes: null,
      },
    })
  ).json();
  expect(result.type, JSON.stringify(result)).toBe('success');
  return { pageUuid: result.pageUuid as string, title };
}

const editorSave = (page: Page) => page.locator('[data-editor-save]');
const headerSave = (page: Page, name: 'Save' | 'Saved') =>
  page.getByRole('button', { name, exact: true });

/** The page's text in its editor, once the editor takes input. */
async function openText(page: Page) {
  await page.locator('button[data-field]').first().click();
  await expect(
    page.locator('dialog .content-editor [contenteditable="true"]').first(),
  ).toBeVisible({ timeout: 15_000 });
}

/** Every state the editor's Save takes from now on, to catch a flash. */
async function recordEditorSave(page: Page) {
  await editorSave(page).evaluate((button) => {
    const said: string[] = [];
    (window as unknown as { editorSaid: string[] }).editorSaid = said;
    new MutationObserver(() =>
      said.push(button.getAttribute('data-editor-save') ?? ''),
    ).observe(button, {
      attributes: true,
      attributeFilter: ['data-editor-save'],
    });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { editorSaid: string[] }).editorSaid,
    );
}

/** A short tone: 16-bit stereo WAV. */
function wav(seconds = 2) {
  const rate = 22_050;
  const samples = Math.round(seconds * rate);
  const bytes = Buffer.alloc(44 + samples * 4);
  bytes.write('RIFF', 0, 'latin1');
  bytes.writeUInt32LE(36 + samples * 4, 4);
  bytes.write('WAVEfmt ', 8, 'latin1');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'latin1');
  bytes.writeUInt32LE(samples * 4, 40);
  // A tone of its own each run, so no run finds the last one's file.
  const pitch = 300 + Math.floor(Math.random() * 400);
  for (let index = 0; index < samples; index++) {
    const value = Math.round(
      Math.sin((2 * Math.PI * pitch * index) / rate) * 0.5 * 32_767,
    );
    bytes.writeInt16LE(value, 44 + index * 4);
    bytes.writeInt16LE(value, 46 + index * 4);
  }
  return bytes;
}

test('a recording’s volume slid in a stored text leaves its Save as it is', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const { assetUuid } = await uploadFile(page.request, 'wav', wav());
  const { pageUuid } = await createPage(page, [
    { type: 'paragraph', data: { text: 'Before the memo.' } },
    {
      type: 'contentAudio',
      data: { asset: { assetUuid }, title: 'Memo', caption: '' },
    },
  ]);
  await open(page, `/admin/pages/${pageUuid}/edit/`);
  await openText(page);
  await expect(editorSave(page)).toHaveAttribute('data-editor-save', 'saved');
  const said = await recordEditorSave(page);

  // By the keys and by the pointer: each step is an `input` of the slider.
  const volume = page
    .locator('dialog .content-editor [data-content-audio]')
    .getByRole('slider', { name: 'Volume' });
  await volume.focus();
  for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowLeft');
  await expect(volume).not.toHaveValue('1');
  await volume.click();

  // Long past the moment the editor reads a text after its last words.
  await page.waitForTimeout(1_500);
  expect(await said()).toEqual([]);
  await expect(editorSave(page)).toHaveAttribute('data-editor-save', 'saved');
  await expect(editorSave(page)).toBeDisabled();
});

test('a text taken into a form that waits on more is not called saved until the form is', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const { pageUuid, title } = await createPage(page, [
    { type: 'paragraph', data: { text: 'Kept.' } },
  ]);
  await open(page, `/admin/pages/${pageUuid}/edit/`);
  // The title changed too: the form will not save itself for the text.
  await page
    .locator('[data-need="title"]')
    .getByRole('textbox')
    .fill(`${title} renamed`);

  await openText(page);
  const save = editorSave(page);
  await expect(save).toHaveAttribute('data-editor-save', 'saved');
  await page
    .locator('dialog .content-editor [contenteditable="true"]')
    .first()
    .click();
  await page.keyboard.press('End');
  await page.keyboard.type(' And more.');
  await expect(save).toHaveAttribute('data-editor-save', 'dirty');
  await save.click();

  // In the form, not stored: nothing left to take in, and not saved.
  await expect(save).toHaveAttribute('data-editor-save', 'clean');
  await expect(save).toHaveText('Save');
  await expect(save).toBeDisabled();
  const stored = await (
    await page.request.get(`/api/admin/pages/${pageUuid}`)
  ).json();
  expect(JSON.stringify(stored.content)).not.toContain('And more.');

  // The form saved, the text is stored: now it is called saved.
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog .content-editor')).toBeHidden();
  await headerSave(page, 'Save').click();
  await expect(headerSave(page, 'Saved')).toBeVisible();
  await openText(page);
  await expect(save).toHaveAttribute('data-editor-save', 'saved');
  await expect(save).toHaveText('Saved');
});

test('a section handed to a project that waits on more is not called saved until the project is', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const stamp = Date.now();
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Handed ${stamp}`,
      summary: 'A project with a section.',
      access: 'private',
      humanReadableSlug: 'handed',
      publicId: `hd${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: {
        data: { blocks: [{ type: 'paragraph', data: { text: 'Text.' } }] },
      },
      relations: [],
      sections: [
        {
          title: `Part ${stamp}`,
          summary: 'A part.',
          humanReadableSlug: 'part',
          publicId: `pt${stamp}`,
          isPrivate: false,
          content: {
            data: { blocks: [{ type: 'paragraph', data: { text: 'Part.' } }] },
          },
          periods: [],
        },
      ],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  await open(page, `/admin/projects/${body.projectUuid}/edit/`);
  await expect(headerSave(page, 'Saved')).toBeVisible();

  const row = page.locator('[data-sections] [data-section-row]').first();
  const dialog = page.locator('dialog[open]').last();
  const sectionSave = dialog.getByRole('button', { name: 'Save', exact: true });
  const sectionTitle = dialog
    .locator('[data-need="title"]')
    .getByRole('textbox');

  // Nothing else waits: handed over, the project saves itself with it.
  await row.locator('[data-section-open]').click();
  await expect(sectionSave).toHaveText('Saved');
  await sectionTitle.fill(`Part one ${stamp}`);
  await expect(sectionSave).toHaveText('Save');
  await sectionSave.click();
  await expect(sectionSave).toHaveText('Saved');
  await expect(sectionSave).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(headerSave(page, 'Saved')).toBeVisible();

  // The project's summary waits to be saved: handed over, the section waits
  // with it, not saved.
  await page
    .locator('[data-need="summary"]')
    .getByRole('textbox')
    .fill('A project with a section, changed.');
  await row.locator('[data-section-open]').click();
  await sectionTitle.fill(`Part two ${stamp}`);
  await sectionSave.click();
  await expect(sectionSave).toBeDisabled();
  await expect(sectionSave).toHaveText('Save');
  await page.waitForTimeout(500);
  await expect(sectionSave).toHaveText('Save');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  // The project saved, the section is stored as it was handed over.
  await headerSave(page, 'Save').click();
  await expect(headerSave(page, 'Saved')).toBeVisible();
  await row.locator('[data-section-open]').click();
  await expect(sectionSave).toHaveText('Saved');
});
