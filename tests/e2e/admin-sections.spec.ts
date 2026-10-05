import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The sections block of a project's edit form: two tabs heading it, the
 * general sections and the dated stages, both always there; each section a
 * row with its name — a lock before it when only the owner sees it — over
 * its picture, the general ones dragged by a grip along their left edge.
 * The rows say nothing of blocks, words and files, and have no removal of
 * their own: a section is removed from its modal.
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

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

function section(
  stamp: number,
  title: string,
  slug: string,
  options: { isPrivate?: boolean; period?: [string, string] } = {},
) {
  return {
    title: `${title} ${stamp}`,
    summary: `About ${slug}`,
    humanReadableSlug: slug,
    publicId: `${slug}${stamp}`,
    isPrivate: options.isPrivate ?? false,
    content: content(`The ${slug} section.`),
    periods: options.period
      ? [{ startDate: options.period[0], endDate: options.period[1] }]
      : [],
  };
}

async function createProject(page: Page, stamp: number, dated = true) {
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Sectioned ${stamp}`,
      summary: 'A project with sections.',
      access: 'public',
      humanReadableSlug: 'sectioned',
      publicId: `sec${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: content('Sections.'),
      sections: [
        section(stamp, 'Topic one', 'one'),
        section(stamp, 'Topic two', 'two', { isPrivate: true }),
        section(stamp, 'Topic three', 'three'),
        ...(dated
          ? [
              section(stamp, 'Early stage', 'early', {
                period: ['2020-01-01', '2020-02-01'],
              }),
              section(stamp, 'Late stage', 'late', {
                period: ['2021-03-01', '2021-04-01'],
              }),
            ]
          : []),
      ],
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

const block = (page: Page) => page.locator('[data-sections]');
const rows = (page: Page) => block(page).locator('[data-section-row]');
const titles = (page: Page) => rows(page).locator('[data-section-title]');
const grips = (page: Page) =>
  block(page).locator('[data-content-section-handle]');
const saved = (page: Page) =>
  page.getByRole('button', { name: 'Saved', exact: true });
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save', exact: true });

/**
 * Drags a row by its grip and sets it down over the top of another, the way
 * a hand does: the sorter follows the pointer on a clock of its own, so it is
 * given the time to.
 */
async function dragRow(page: Page, row: Locator, before: Locator) {
  await row.scrollIntoViewIfNeeded();
  const grip = (await row
    .locator('[data-content-section-handle]')
    .boundingBox())!;
  const target = (await before.boundingBox())!;
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  const to = { x: start.x, y: target.y + 6 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 20;
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(start.x, start.y + ((to.y - start.y) * step) / steps);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await page.mouse.up();
}

for (const width of [375, 1280]) {
  test(`two tabs head the sections, whose rows keep to the name, the lock and the grip at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const stamp = Date.now();
    await openEditForm(page, await createProject(page, stamp));
    await expect(saved(page)).toBeVisible();

    const tabs = block(page).getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(0)).toHaveAccessibleName('General sections');
    await expect(tabs.nth(1)).toHaveAccessibleName('Dated stages');
    await expect(tabs.nth(0)).toContainText('3');
    await expect(tabs.nth(1)).toContainText('2');

    await expect(titles(page)).toHaveText([
      `Topic one ${stamp}`,
      `Private section: Topic two ${stamp}`,
      `Topic three ${stamp}`,
    ]);
    // Removal lives in the section's modal, the figures nowhere.
    await expect(
      block(page).getByRole('button', { name: /Delete section/ }),
    ).toHaveCount(0);
    await expect(
      block(page).locator('[data-title-popup*="block"]'),
    ).toHaveCount(0);

    // The lock comes before the name, in the accent.
    const lock = rows(page).nth(1).locator('[data-section-private]');
    await expect(lock).toBeVisible();
    const accent = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.className = 'text-accent';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(lock).toHaveCSS('color', accent);
    const lockBox = (await lock.boundingBox())!;
    const titleBox = (await rows(page)
      .nth(1)
      .locator('[data-section-title]')
      .boundingBox())!;
    expect(lockBox.x - titleBox.x).toBeLessThan(1);
    await expect(
      rows(page).nth(0).locator('[data-section-private]'),
    ).toHaveCount(0);

    // Each row keeps inside the block, its grip the whole height of its
    // left edge.
    const panel = (await block(page).boundingBox())!;
    await expect(grips(page)).toHaveCount(3);
    for (const row of await rows(page).all()) {
      const box = (await row.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(panel.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(
        panel.x + panel.width + 0.5,
      );
      const grip = (await row
        .locator('[data-content-section-handle]')
        .boundingBox())!;
      expect(grip.x - box.x).toBeLessThan(2);
      expect(grip.height).toBeGreaterThanOrEqual(box.height - 2);
      expect(grip.width).toBeLessThan(box.width / 6);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);

    // The stages keep their time order: newest first, and no grip.
    await tabs.nth(1).click();
    await expect(titles(page)).toHaveText([
      `Late stage ${stamp}`,
      `Early stage ${stamp}`,
    ]);
    await expect(grips(page)).toHaveCount(0);

    // A stage's dates cannot be pressed: they stand raised off the row from
    // the start, on a ground a picture beneath shows through.
    const chip = rows(page).nth(0).locator('[data-date-range-chip]');
    await expect(chip).toBeVisible();
    const [chipGround, rowGround] = await Promise.all([
      chip.evaluate((element) => getComputedStyle(element).backgroundColor),
      rows(page)
        .nth(0)
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    expect(chipGround).not.toBe(rowGround);
    expect(chipGround).toMatch(/\/ 0\.\d+\)$/);
  });
}

test('an empty tab says what it has none of', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  await openEditForm(page, await createProject(page, stamp, false));
  const tabs = block(page).getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await tabs.nth(1).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(block(page).locator('[data-sections-empty]')).toHaveText(
    'No dated stages yet.',
  );
});

test('general sections are dragged and moved by the arrows into order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  await openEditForm(page, await createProject(page, stamp));
  await expect(saved(page)).toBeVisible();
  const order = (...names: string[]) =>
    names.map((name) =>
      name === 'two'
        ? `Private section: Topic two ${stamp}`
        : `Topic ${name} ${stamp}`,
    );

  // The third, taken by its grip and set down over the first.
  await dragRow(page, rows(page).nth(2), rows(page).nth(0));
  await expect(titles(page)).toHaveText(order('three', 'one', 'two'));
  // The drop opens nothing.
  await page.waitForTimeout(300);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(save(page)).toBeVisible();

  // The arrows move it on, and the grip keeps the focus between moves.
  const grip = rows(page).nth(0).locator('[data-content-section-handle]');
  await grip.focus();
  await page.keyboard.press('ArrowDown');
  await expect(titles(page)).toHaveText(order('one', 'three', 'two'));
  await page.keyboard.press('ArrowDown');
  await expect(titles(page)).toHaveText(order('one', 'two', 'three'));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(titles(page)).toHaveText(order('three', 'one', 'two'));
  await expect(page.locator(':focus')).toHaveAccessibleName(
    `Reorder project section: Topic three ${stamp}`,
  );
});

test('a section is removed from its modal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  await openEditForm(page, await createProject(page, stamp));
  await expect(saved(page)).toBeVisible();

  await rows(page).nth(2).locator('[data-section-open]').click();
  const dialog = page.locator('dialog[open]').last();
  await dialog.getByRole('button', { name: 'Delete section' }).click();
  const confirmation = page.locator('dialog[open]').last();
  await confirmation
    .getByRole('button', { name: `Topic three ${stamp}`, exact: true })
    .click();
  await confirmation
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(titles(page)).toHaveText([
    `Topic one ${stamp}`,
    `Private section: Topic two ${stamp}`,
  ]);
  await expect(block(page).getByRole('tab').nth(0)).toContainText('2');
  await expect(save(page)).toBeVisible();
});
