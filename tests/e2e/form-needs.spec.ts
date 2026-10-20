import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Every admin form says why its Save cannot save yet (`useFormNeeds`): the
 * button looks disabled but stays pressable, its hint and description name
 * what the form needs; a press, a tap or Ctrl+S says it on the line under
 * the header — short enough for a phone — and marks the fields; filled, the
 * line and the marks go. The diary form has its own spec
 * (`diary-new-entry.spec.ts`).
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };

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

const line = (scope: Page | Locator) => scope.locator('[data-header-error]');
const marked = (scope: Page | Locator) => scope.locator('[data-field-needed]');
const hint = (page: Page) => page.locator('[data-title-popup-el]');

/** A pattern whose spaces match any space: phrases carry non-breaking ones. */
function loose(pattern: RegExp) {
  return new RegExp(pattern.source.replaceAll(' ', '\\s'), pattern.flags);
}

/** Pressable, looking disabled, and saying why — in its hint and to a reader. */
async function expectBlocked(button: Locator, pattern: RegExp) {
  const reason = loose(pattern);
  // Playwright reads aria-disabled as disabled: the button itself is not.
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).not.toHaveAttribute('disabled');
  await expect(button).toHaveAccessibleDescription(reason);
  await expect(button).toHaveAttribute('data-title-popup', reason);
}

/** The line stays a line or two, inside the screen, the header whole. */
async function expectLineFits(page: Page, header: Locator) {
  const box = (await line(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.height).toBeLessThanOrEqual(64);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  // The header's own row keeps its height: the button is where it was.
  const button = (await header.boundingBox())!;
  expect(button.y).toBeLessThan(box.y);
}

/**
 * A press of a button that cannot act yet, as a pointer makes it: Playwright
 * would wait for its aria-disabled to go.
 */
const press = (button: Locator) => button.click({ force: true });

const create = (page: Page) =>
  page.getByRole('button', { name: 'Create', exact: true });
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save', exact: true });

test('a new event says what it needs: in its hint, on Ctrl+S, at its labels', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await open(page, '/admin/events/new/');
  await expectBlocked(
    create(page),
    /Still to fill in: Event title, .*Event summary, Time periods, Event content/,
  );
  await create(page).hover();
  await expect(hint(page)).toContainText('Still to fill in: Event title');

  await page.mouse.move(10, 500);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(line(page)).toContainText(
    loose(/Still to fill in: Event title, .+ and \d more/),
  );
  await expect(marked(page).first()).toHaveText(/Event title/);
  const count = await marked(page).count();
  expect(count).toBeGreaterThanOrEqual(4);
  await expectLineFits(page, create(page));

  // Filled, a field lets go of its mark and leaves the line.
  await page
    .locator('[data-need="title"]')
    .getByRole('textbox')
    .fill('Makers fair');
  await expect(marked(page)).toHaveCount(count - 1);
  await expect(line(page)).not.toContainText('Event title');
});

test('on a phone, a tap on the Create square says it, in two lines at most', async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: fileURLToPath(
      new URL('./.artifacts/admin.json', import.meta.url),
    ),
    viewport: PHONE,
    hasTouch: true,
  });
  const page = await context.newPage();
  await open(page, '/admin/events/new/');
  // A half-set action button adds a field to correct to the line.
  await page.getByRole('switch').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await create(page).boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(line(page)).toContainText(
    loose(/Still to fill in: Event title, .+ and \d more/),
  );
  await expect(line(page)).toContainText('To correct: Event action button');
  await expectLineFits(page, create(page));
  await context.close();
});

test('a new project says what it needs on Ctrl+S', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page, '/admin/projects/new/');
  await expectBlocked(create(page), /Still to fill in: Project Title/);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(line(page)).toContainText('Still to fill in: Project Title');
  await expect(marked(page).first()).toHaveText(/Project Title/);
});

test('a page with a bad address says what to correct, beside what is empty', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  // A page already holds the address the title will make.
  const title = `About the fair ${Date.now()}`;
  const slug = title.toLowerCase().replaceAll(' ', '-');
  const response = await page.request.post('/api/admin/pages', {
    data: {
      title,
      summary: 'Taken first.',
      slug,
      access: 'private',
      content: {
        data: { blocks: [{ type: 'paragraph', data: { text: 'First.' } }] },
      },
      reminder: '',
      notes: null,
    },
  });
  expect((await response.json()).type).toBe('success');
  await open(page, '/admin/pages/new/');
  await page.locator('[data-need="title"]').getByRole('textbox').fill(title);
  await page
    .locator('[data-need="summary"]')
    .getByRole('textbox')
    .fill('What the fair was.');
  await expect(
    page.locator('[data-need="slug"]').getByRole('textbox'),
  ).toHaveValue(slug);
  await expectBlocked(
    create(page),
    /Still to fill in: .*Page content.*Page slug: A page with this slug already exists/s,
  );
  await page.keyboard.press('ControlOrMeta+s');
  await expect(line(page)).toContainText(
    loose(/Still to fill in: .*Page content/),
  );
  await expect(line(page)).toContainText('To correct: Page slug');
  await expect(marked(page)).toHaveText([
    /Page access/,
    /Page slug/,
    /Page content/,
  ]);
});

test('a new tag says what it needs, and lets go once its title is typed', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await open(page, '/admin/tags/new/');
  await expectBlocked(create(page), /Still to fill in: Tag title/);
  await press(create(page));
  await expect(line(page)).toContainText('Still to fill in: Tag title');
  await expectLineFits(page, create(page));
  await page
    .locator('[data-need="title"]')
    .getByRole('textbox')
    .fill(`Fairs ${Date.now()}`);
  await expect(line(page)).toBeHidden();
  await expect(marked(page)).toHaveCount(0);
  await expect(create(page)).not.toHaveAttribute('aria-disabled');
});

test('the profile without its name says so, and nothing is saved', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await open(page, '/admin/about/');
  const name = page.locator('[data-need="name"]').getByRole('textbox');
  const kept = await name.inputValue();
  await name.fill('');
  await expectBlocked(save(page), /Still to fill in: Name/);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(line(page)).toHaveText('Still to fill in: Name');
  await name.fill(kept);
  await expect(line(page)).toBeHidden();
});

test('settings with a bad site address say what is wrong with it', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await open(page, '/admin/settings/');
  const address = page.locator('[data-need="site-url"]').getByRole('textbox');
  const kept = await address.inputValue();
  await address.fill('not an address');
  await expectBlocked(save(page), /Site Address: not a full address/);
  await press(save(page));
  await expect(line(page)).toHaveText(
    'Site Address: not a full address with a scheme and a host',
  );
  await expectLineFits(page, save(page));
  await address.fill(kept);
  await expect(line(page)).toBeHidden();
});

test('a new section says what it needs under its own header', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const stamp = Date.now();
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Harbour ${stamp}`,
      summary: 'A project.',
      access: 'public',
      humanReadableSlug: 'harbour',
      publicId: `hb${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: {
        data: { blocks: [{ type: 'paragraph', data: { text: 'Text.' } }] },
      },
      relations: [],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  await open(page, `/admin/projects/${body.projectUuid}/edit/`);
  await page.getByRole('button', { name: 'Add section' }).click();
  const dialog = page.locator('dialog[open]');
  const button = dialog.getByRole('button', { name: 'Save', exact: true });
  await expectBlocked(
    button,
    /Still to fill in: Section title, Time periods or Section content/,
  );
  await press(button);
  await expect(line(dialog)).toHaveText(
    'Still to fill in: Section title, Time periods or Section content',
  );
  // Both of the fields either of which will do are marked.
  await expect(marked(dialog)).toHaveText([
    /Section title/,
    /Time periods/,
    /Section content/,
  ]);
  await dialog
    .locator('[data-need="title"]')
    .getByRole('textbox')
    .fill('The first summer');
  await expect(line(dialog)).toHaveText(
    'Still to fill in: Time periods or Section content',
  );
});

test('a status emptied of its words says it needs them', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await open(page, '/admin/about/');
  await page.getByRole('button', { name: 'New status' }).click();
  const dialog = page.locator('dialog[open]');
  const words = `Busy ${Date.now()}`;
  await dialog.locator('[data-need="text"]').getByRole('textbox').fill(words);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The newest status heads the list.
  await expect(page.getByText(words)).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const edit = page.locator('dialog[open]');
  await edit.locator('[data-need="text"]').getByRole('textbox').fill('');
  const button = edit.getByRole('button', { name: 'Save', exact: true });
  await expectBlocked(button, /Still to fill in: Status/);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(line(edit)).toHaveText('Still to fill in: Status');
  await expect(marked(edit)).toHaveText([/Status/]);
});
