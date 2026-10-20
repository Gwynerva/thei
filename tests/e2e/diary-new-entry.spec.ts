import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Writing today down, as the lab's first study played it: a new diary
 * entry's text typed, saved with Ctrl+S and closed with Escape at once; what
 * the text's save control says of a text never stored; the kinds of a
 * relation named as their sentences say them; the controls of the form
 * called by what they show; and a Create that says what it still needs.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };
const SIZES = [
  { name: 'desktop', size: DESKTOP },
  { name: 'phone', size: PHONE },
];

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/**
 * A day of 2012, a year no other spec writes to, that holds no entry yet: a
 * spec run again writes beside what it wrote before.
 */
async function freeDay(page: Page) {
  const taken = new Set(
    (
      (await (await page.request.get('/api/admin/diary/dates')).json()) as {
        date: string;
      }[]
    ).map((entry) => entry.date),
  );
  for (let day = Date.UTC(2012, 0, 1); ; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (!taken.has(date)) return date;
  }
}

async function openNewEntry(page: Page, date: string) {
  await page.goto(`/admin/diary/new/?date=${date}`);
  // The form is drawn on the server; it answers once it has hydrated.
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const textField = (page: Page) =>
  page.getByRole('button', { name: 'Edit: Entry content' });
const editor = (page: Page) => page.locator('dialog .content-editor');
/** The text's first paragraph, found as a reader of the screen finds it. */
const paragraph = (page: Page) =>
  page
    .locator('dialog[open]')
    .getByRole('textbox', { name: 'Entry content' })
    .first();
const editorSave = (page: Page) => page.locator('[data-editor-save]');
const editorFoot = (page: Page) => page.locator('[data-editor-foot]');
const create = (page: Page) =>
  page.getByRole('button', { name: 'Create', exact: true });
const hint = (page: Page) => page.locator('[data-title-popup-el]');

async function openText(page: Page) {
  await textField(page).click();
  // Editor.js loads on first use; the text shows once it takes input.
  await expect(paragraph(page)).toBeVisible({ timeout: 15_000 });
}

/** The phone's square shows this icon, and not the other. */
async function expectSquare(button: Locator, shown: string, not: string) {
  await expect(button.locator(`use[href="#thei-icon-${shown}"]`)).toBeVisible();
  await expect(button.locator(`use[href="#thei-icon-${not}"]`)).toBeHidden();
}

for (const { name, size } of SIZES) {
  test(`Ctrl+S right after the last word saves it, and Escape after it closes on it (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openNewEntry(page, await freeDay(page));
    await openText(page);

    // Nothing written yet: nothing to save, and nothing called saved — the
    // foot says the text never was.
    const save = editorSave(page);
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute('data-editor-save', 'clean');
    if (name === 'desktop') await expect(save).toHaveText('Save');
    else await expectSquare(save, 'save', 'check');
    await expect(editorFoot(page)).toContainText('Never saved');

    const words = `Today I kept thinking about the fair ${Date.now()}.`;
    await paragraph(page).click();
    await page.keyboard.type(words);
    // At once: Editor.js tells of the words 400 ms after the last key, and
    // the button does not wait for it.
    await expect(save).toBeEnabled({ timeout: 300 });
    await expect(save).toHaveAttribute('data-editor-save', 'dirty');
    await page.keyboard.press('ControlOrMeta+s');
    await page.keyboard.press('Escape');

    // Saved into the form, and closed without a question.
    await expect(editor(page)).toBeHidden();
    await expect(textField(page)).toContainText(words);
    await expect(create(page)).toBeEnabled();

    // The entry made, its text is stored: now it is called saved.
    await create(page).click();
    await expect(page).toHaveURL(/\/admin\/diary\/[^/]+\/edit\/$/);
    await expect(page.locator('html')).toHaveAttribute(
      'data-nuxt-hydrated',
      'true',
    );
    await openText(page);
    await expect(paragraph(page)).toHaveText(words);
    await expect(save).toHaveAttribute('data-editor-save', 'saved');
    if (name === 'desktop') await expect(save).toHaveText('Saved');
    else await expectSquare(save, 'check', 'save');
  });
}

test('Escape over words not saved asks, and closing keeps nothing in the form', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openNewEntry(page, await freeDay(page));
  await openText(page);
  await paragraph(page).click();
  const words = `Not saved yet ${Date.now()}`;
  await page.keyboard.type(words);

  // Pressed before Editor.js has told of the words: it asks all the same.
  const asked: string[] = [];
  page.once('dialog', (dialog) => {
    asked.push(dialog.message());
    void dialog.dismiss();
  });
  await page.keyboard.press('Escape');
  await expect
    .poll(() => asked)
    .toEqual(['You have unsaved changes. Close without saving?']);
  await expect(editor(page)).toBeVisible();
  await expect(paragraph(page)).toHaveText(words);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  await expect(textField(page)).toContainText('No content yet');
});

test('saved into a form whose entry is not made yet, the text is not called saved', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openNewEntry(page, await freeDay(page));
  await openText(page);
  await paragraph(page).click();
  await page.keyboard.type(`Into the form ${Date.now()}`);
  const save = editorSave(page);
  await save.click();
  // Nothing left to take into the form, and still never stored.
  await expect(save).toBeDisabled();
  await expect(save).toHaveText('Save');
  await expect(save).toHaveAttribute('data-editor-save', 'clean');
  await expect(editorFoot(page)).toContainText('Never saved');
});

/** An entry made through the API, its text in the editor on its edit page. */
async function openStoredEntry(page: Page, paragraphs: string[]) {
  const response = await page.request.post('/api/admin/diary', {
    data: {
      date: await freeDay(page),
      access: 'public',
      content: {
        data: {
          blocks: paragraphs.map((text) => ({
            type: 'paragraph',
            data: { text },
          })),
        },
      },
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  await page.goto(`/admin/diary/${body.diaryUuid}/edit/`);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await openText(page);
}

for (const { name, size } of SIZES) {
  test(`Ctrl+Z takes back a word typed into a stored text whole (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openStoredEntry(page, ['Say']);
    const save = editorSave(page);
    await expect(save).toHaveAttribute('data-editor-save', 'saved');
    await paragraph(page).click();
    await page.keyboard.press('End');
    // A first key that stays visible were it left behind.
    await page.keyboard.type(', hello');
    // The save control turns at the first key; doing so must not split the
    // browser's run of typing, or Ctrl+Z would leave the first letter.
    await expect(save).toHaveAttribute('data-editor-save', 'dirty');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(paragraph(page)).toHaveText('Say');
    await expect(save).toHaveAttribute('data-editor-save', 'saved');
  });
}

test('opening a stored text changes nothing: its save control stays as it is', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openStoredEntry(page, ['One.', 'Two.']);
  // Every paragraph is a text box called by its text.
  await expect(
    page
      .locator('dialog[open]')
      .getByRole('textbox', { name: 'Entry content' }),
  ).toHaveCount(2);
  const save = editorSave(page);
  await expect(save).toHaveText('Saved');
  await save.evaluate((button) => {
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    new MutationObserver(() => said.push(button.textContent!.trim())).observe(
      button,
      { childList: true, characterData: true, subtree: true },
    );
  });
  // Naming the paragraphs is no change of the text: the control stays.
  await page.waitForTimeout(1_500);
  expect(
    await page.evaluate(() => (window as unknown as { said: string[] }).said),
  ).toEqual([]);
});

for (const { name, size } of SIZES) {
  test(`the form's controls are called by what they show (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openNewEntry(page, await freeDay(page));
    const access = page.getByRole('group', { name: 'Entry access' });
    const open = access.getByRole('button', { name: 'Public', exact: true });
    const closed = access.getByRole('button', { name: 'Private', exact: true });
    await expect(open).toHaveAttribute('aria-pressed', 'true');
    await expect(closed).toHaveAttribute('aria-pressed', 'false');
    await closed.click();
    await expect(closed).toHaveAttribute('aria-pressed', 'true');
    await expect(open).toHaveAttribute('aria-pressed', 'false');
  });
}

test('each kind of relation is named by the word its sentence says', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const stamp = Date.now();
  const title = `Makers fair ${stamp}`;
  const event = await page.request.post('/api/admin/events', {
    data: {
      title,
      summary: 'A fair.',
      access: 'public',
      humanReadableSlug: 'makers-fair',
      publicId: `mf${stamp}`,
      content: {
        data: { blocks: [{ type: 'paragraph', data: { text: 'Fair.' } }] },
      },
      periods: [{ startDate: '2024-03-14', endDate: '2024-03-14' }],
    },
  });
  expect((await event.json()).type).toBe('success');
  await openNewEntry(page, await freeDay(page));

  await page.getByRole('button', { name: 'Add a relation' }).click();
  const modal = page.locator('[data-relation-modal]');
  const search = page.locator('section[role="dialog"]').getByRole('combobox');
  await expect(search).toBeFocused();
  await search.fill(title);
  // The picker's rows are options called by what they show.
  await page
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(title) })
    .click();
  await expect(modal.locator('[data-relation-entity]')).toContainText(title);

  const kinds = modal.getByRole('group', { name: 'Kind of relation' });
  const radio = (word: string) =>
    kinds.getByRole('radio', { name: word, exact: true });
  await expect(radio('Related')).toBeChecked();
  // Each radio is called by its word and described by its sentence, which
  // says the same of the event, never the other way round.
  await expect(radio('Affects')).toHaveAccessibleDescription(
    new RegExp(`^${title} affects\\s+\\S`),
  );
  await expect(radio('Depends on')).toHaveAccessibleDescription(
    new RegExp(`^${title} depends on\\s+\\S`),
  );
  await expect(radio('Related')).toHaveAccessibleDescription(
    new RegExp(`^${title} and\\s+\\S.* are related$`),
  );
  // Never by the values the form keeps.
  await expect(
    kinds.getByRole('radio', { name: /^(related|influencing|dependent)$/ }),
  ).toHaveCount(0);
  for (const [type, word, verb] of [
    ['influencing', 'Affects', 'affects'],
    ['dependent', 'Depends on', 'depends on'],
  ] as const) {
    const option = modal.locator(`[data-relation-option="${type}"]`);
    await expect(option).toContainText(word);
    await expect(option.locator('[data-relation-sentence]')).toContainText(
      `${title} ${verb} `,
    );
  }

  await kinds.getByText('Affects', { exact: true }).click();
  await expect(radio('Affects')).toBeChecked();
  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(modal).toHaveCount(0);
  // The chip under the event's name wears the same word.
  const chip = page.locator('[data-relation-chip]').filter({ hasText: title });
  await expect(chip.locator('[data-relation-label]')).toHaveText('Affects');
});

test('a Create that cannot create yet says what it still needs (desktop)', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await openNewEntry(page, await freeDay(page));
  const button = create(page);
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(
    'Still to fill in: Entry content',
  );
  await button.hover();
  await expect(hint(page)).toBeVisible();
  await expect(hint(page)).toContainText('Create');
  await expect(hint(page)).toContainText('Still to fill in: Entry content');
  await page.mouse.move(10, 400);

  // Ctrl+S asks for a save it cannot make: the header says why.
  await page.keyboard.press('ControlOrMeta+s');
  const alert = page.locator('[data-header-error]');
  await expect(alert).toHaveText('Still to fill in: Entry content');
  await expect(alert).toHaveAttribute('role', 'alert');
  // Closed by hand, it comes back for the next press.
  await alert.getByRole('button', { name: 'Hide the message' }).click();
  await expect(alert).toBeHidden();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(alert).toBeVisible();

  // Filled, the line goes and nothing is held against the button.
  await openText(page);
  await paragraph(page).click();
  await page.keyboard.type('A good day.');
  await page.keyboard.press('ControlOrMeta+s');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  await expect(alert).toBeHidden();
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute('aria-describedby');
  await expect(button).not.toHaveAttribute('data-title-popup');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, viewport: PHONE });

  test('a tap on the disabled Create square says what it still needs', async ({
    page,
  }) => {
    await openNewEntry(page, await freeDay(page));
    const button = create(page);
    await expect(button).toBeDisabled();
    await expectSquare(button, 'save', 'check');
    const box = (await button.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(hint(page)).toBeVisible();
    await expect(hint(page)).toContainText('Still to fill in: Entry content');
    // The hint stays on the screen.
    const shown = (await hint(page).boundingBox())!;
    expect(shown.x).toBeGreaterThanOrEqual(0);
    expect(shown.x + shown.width).toBeLessThanOrEqual(PHONE.width);
  });
});
