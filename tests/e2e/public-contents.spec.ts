import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The table of contents lights the entry the reader is in: nothing while the
 * text above the first heading is read, a section while a long one fills the
 * window, every short section at the end of the page in turn, an entry a link
 * led to at once. A modal over the page changes nothing, and a page without
 * contents and back leaves it working.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const stamp = Date.now();
const slug = `contents-${stamp}`;
const filler = (words: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    type: 'paragraph',
    data: {
      text: `${words} ${index + 1}. A paragraph long enough to take a few lines of the page, so that a section of them runs well past a window of any height.`,
    },
  }));
const heading = (text: string, level: 2 | 3 = 2) => ({
  type: 'header',
  data: { text, level },
});

test.beforeAll(async ({ request }) => {
  const created = await request.post('/api/admin/pages', {
    data: {
      title: `Contents ${stamp}`,
      summary: 'A page for the contents spec.',
      slug,
      // Kept out of the public lists other specs read.
      access: 'private',
      content: {
        data: {
          blocks: [
            ...filler('Before any heading', 30),
            heading('Alpha'),
            ...filler('Alpha', 40),
            heading('Alpha detail', 3),
            ...filler('Alpha detail', 10),
            heading('Beta'),
            ...filler('Beta', 40),
            heading('Gamma'),
            ...filler('Gamma', 1),
            heading('Delta'),
            ...filler('Delta', 1),
            heading('Omega'),
            ...filler('Omega', 1),
          ],
        },
      },
      reminder: '',
      notes: null,
    },
  });
  expect((await created.json()).type).toBe('success');
});

const path = `/pages/${slug}/`;

async function open(page: Page, to = path) {
  await page.goto(to);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const contents = (page: Page) => page.locator('aside nav').first();
const current = (scope: Locator) => scope.locator('a[aria-current="location"]');

function scrollTo(page: Page, y: number) {
  return page.evaluate((top) => window.scrollTo(0, top), y);
}

function headingTop(page: Page, name: string) {
  return page.evaluate(
    (text) =>
      [...document.querySelectorAll('main h2, main h3')]
        .find((element) => element.textContent?.trim() === text)!
        .getBoundingClientRect().top + window.scrollY,
    name,
  );
}

test('lights the section the reader is in, from the first words to the bottom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  const nav = contents(page);
  await expect(nav.getByRole('link')).toHaveCount(6);

  // The text above the first heading: nothing lit.
  await expect(current(nav)).toHaveCount(0);
  await scrollTo(page, 600);
  await expect(current(nav)).toHaveCount(0);

  // Deep inside Alpha, with no heading in the window: Alpha.
  const alpha = await headingTop(page, 'Alpha');
  const detail = await headingTop(page, 'Alpha detail');
  expect(detail - alpha).toBeGreaterThan(720 * 2);
  await scrollTo(page, (alpha + detail) / 2 - 360);
  await expect(current(nav)).toHaveText('Alpha');

  // A subsection lights itself, and the line its group stands along.
  await scrollTo(page, detail + 200);
  await expect(current(nav)).toHaveText('Alpha detail');
  await expect(current(nav).locator('..')).toHaveClass(/border-accent/);
  await expect(
    nav.getByRole('link', { name: 'Alpha', exact: true }),
  ).not.toHaveClass(/text-accent/);

  // Down to the bottom a little at a time: every short section at the end
  // lights in turn, none skipped, the last at the very bottom.
  const beta = await headingTop(page, 'Beta');
  const bottom = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  const seen: string[] = [];
  for (let y = beta; y <= bottom + 20; y += 15) {
    await scrollTo(page, y);
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => done(null))),
    );
    const text = (await current(nav).textContent()) ?? '';
    if (seen.at(-1) !== text) seen.push(text);
  }
  expect(seen).toEqual(['Beta', 'Gamma', 'Delta', 'Omega']);
});

test('lights an entry a link led to, until the reader scrolls on', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  const nav = contents(page);
  await nav.getByRole('link', { name: 'Gamma' }).click();
  await expect(page).toHaveURL(/#gamma$/);
  await expect(current(nav)).toHaveText('Gamma');

  await page.keyboard.press('Home');
  await expect(current(nav)).toHaveCount(0);
});

test('keeps the entry under a modal, and in the sheet on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  const beta = await headingTop(page, 'Beta');
  await scrollTo(page, beta + 400);
  const scrolled = await page.evaluate(() => window.scrollY);

  const expand = page.getByRole('button', { name: /Expand|Развернуть/ });
  await expand.click();
  const sheet = page.locator('dialog[open]');
  await expect(current(sheet)).toHaveText('Beta');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  // An entry followed from the sheet is lit once it closes over its place.
  await expand.click();
  await sheet.getByRole('link', { name: 'Alpha', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expand.click();
  await expect(current(sheet)).toHaveText('Alpha');
});

test('works again after a page without contents', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await scrollTo(page, (await headingTop(page, 'Beta')) + 300);
  await expect(current(contents(page))).toHaveText('Beta');

  // Through the router, as a reader goes: the layout of the page is left.
  await page.getByRole('link', { name: 'Life', exact: true }).click();
  await expect(page).toHaveURL(/\/life\/$/);
  await expect(page.locator('aside nav a[aria-current]')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(contents(page).getByRole('link')).toHaveCount(6);
  await scrollTo(page, (await headingTop(page, 'Alpha detail')) + 100);
  await expect(current(contents(page))).toHaveText('Alpha detail');
  expect(errors).toEqual([]);
});
