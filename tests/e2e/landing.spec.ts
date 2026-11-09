import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { E2E_ORIGIN } from './fixture-url';
import { screenshot } from './screenshots';
import { uploadPicture } from './helpers/upload';

/**
 * Every link to a place on a page lands the same way (`shared/landing.ts`,
 * `app/composables/landing.ts`): an entry of the contents lights its heading,
 * again when pressed again; a heading under a spoiler is brought out; going
 * back lights nothing. A file's window has an address of its own while it is
 * open, which opens the same window again — the gallery turned to the file —
 * and which a stranger, sent one into a private part, opens as a page with
 * no window.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

/** Opens a page once it answers clicks and keys. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const lit = (page: Page) => page.locator('[data-landing-found]');
const filler = (words: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    type: 'paragraph',
    data: {
      text: `${words} ${index + 1}. A paragraph long enough to take a few lines of the page, so that the headings stand well apart.`,
    },
  }));
const heading = (text: string, extra: Record<string, unknown> = {}) => ({
  type: 'header',
  data: { text, level: 2 },
  ...extra,
});

async function createPage(
  request: APIRequestContext,
  slug: string,
  access: string,
  blocks: unknown[],
) {
  const created = await request.post('/api/admin/pages', {
    data: {
      title: `Landing ${slug}`,
      summary: 'A page for the landing spec.',
      slug,
      access,
      content: { data: { blocks } },
      reminder: '',
      notes: null,
    },
  });
  const body = await created.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return `/pages/${slug}/`;
}

test('an anchor is lit, again when followed again, and never by Back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const path = await createPage(
    page.request,
    `landing-anchors-${randomUUID().slice(0, 8)}`,
    'private',
    [
      ...filler('Before', 10),
      heading('Alpha'),
      ...filler('Alpha', 15),
      heading('Beta'),
      ...filler('Beta', 15),
      heading('Behind the veil', { tunes: { spoiler: true } }),
      ...filler('Veil', 15),
      heading('Gamma'),
      ...filler('Gamma', 15),
    ],
  );
  await open(page, path);
  const contents = page.locator('aside nav').first();

  await contents.getByRole('link', { name: 'Beta' }).click();
  await expect(page).toHaveURL(/#beta$/);
  await expect(page.locator('#beta')).toHaveAttribute('data-landing-found');
  await expect(page.locator('.landing-light')).toHaveCount(1);
  await expect(page.locator('#beta')).toBeInViewport();

  // The same entry once more lights it once more.
  await page.evaluate(() =>
    document
      .querySelector('[data-landing-found]')
      ?.removeAttribute('data-landing-found'),
  );
  await contents.getByRole('link', { name: 'Beta' }).click();
  await expect(page.locator('#beta')).toHaveAttribute('data-landing-found');

  await contents.getByRole('link', { name: 'Gamma' }).click();
  await expect(page.locator('#gamma')).toHaveAttribute('data-landing-found');
  await expect(lit(page)).toHaveCount(1);

  // Back is a step of the history: nothing is lit.
  await page.goBack();
  await expect(page).toHaveURL(/#beta$/);
  await expect(lit(page)).toHaveCount(0);
  await expect(page.locator('.landing-light')).toHaveCount(0);

  // A heading under a spoiler, opened afresh: brought out, into sight, lit.
  await open(page, `${path}#behind-the-veil`);
  const veiled = page.locator('#behind-the-veil');
  await expect(veiled).toHaveAttribute('data-landing-found');
  await expect(
    page.locator('.content-spoiler', { has: veiled }),
  ).toHaveAttribute('data-revealed', 'true');
  await expect(veiled).toBeInViewport();
});

test('a window of a file has an address that opens it again', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const run = randomUUID().slice(0, 8);
  const [first, second, hidden] = await Promise.all(
    [0, 1, 2].map(async () => (await uploadPicture(page.request)).asset),
  );
  const path = await createPage(
    page.request,
    `landing-window-${run}`,
    'public',
    [
      ...filler('Before', 12),
      {
        id: 'pictures',
        type: 'contentGallery',
        data: {
          items: [
            {
              id: 'one',
              asset: { assetUuid: first!.assetUuid },
              caption: 'Dawn',
            },
            {
              id: 'two',
              asset: { assetUuid: second!.assetUuid },
              caption: 'Dusk',
            },
          ],
        },
      },
      ...filler('After', 4),
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'mine', edge: 'start' },
      },
      {
        id: 'kept',
        type: 'contentMedia',
        data: { layout: 'centered', asset: { assetUuid: hidden!.assetUuid } },
      },
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'mine', edge: 'end' },
      },
    ],
  );

  // Opened by a press, the window writes its address; a step changes it in
  // place, adding nothing to the history.
  await open(page, path);
  const gallery = page.locator('[data-block="pictures"]');
  await gallery.getByRole('button', { name: /Dusk/ }).first().click();
  await gallery.locator('[data-gallery-view] [data-opens-viewer]').click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Dusk');
  const dusk = `#b-pictures~${second!.slug}~open`;
  await expect(page).toHaveURL(new RegExp(`${dusk}$`));
  const length = await page.evaluate(() => history.length);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(new RegExp(`#b-pictures~${first!.slug}~open$`));
  expect(await page.evaluate(() => history.length)).toBe(length);

  // Back closes the window, and the page's address comes back.
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${path}$`));

  // Sent to a stranger, the address opens the same: the gallery turned to
  // the file, the window on it.
  const visitor = await page
    .context()
    .browser()!
    .newContext({
      baseURL: E2E_ORIGIN,
      storageState: { cookies: [], origins: [] },
      viewport: { width: 375, height: 812 },
    });
  const guest = await visitor.newPage();
  await open(guest, `${path}${dusk}`);
  const window = guest.locator('dialog[open]');
  await expect(window).toContainText('Dusk');
  await expect(
    guest.locator('[data-block="pictures"] [data-gallery-view]'),
  ).toHaveAttribute('data-file', second!.slug);
  await expect(guest).toHaveURL(new RegExp(`${dusk}$`));
  await screenshot(guest, 'landing-window-375');

  // Closed, it leaves the page at the file: a reload opens no window.
  await guest.goBack();
  await expect(window).toHaveCount(0);
  await expect(guest).toHaveURL(new RegExp(`#b-pictures~${second!.slug}$`));
  await guest.reload();
  await expect(guest.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await expect(
    guest.locator('[data-block="pictures"] [data-gallery-view]'),
  ).toHaveAttribute('data-landing-found');
  await expect(guest.locator('dialog[open]')).toHaveCount(0);

  // A file of a private part is not on a stranger's page: its address opens
  // the page, with no window and nothing said. The landing on it begins by
  // putting out the file lit before; and with its place not on the page, it
  // has nothing it could open a window on.
  await open(guest, `${path}#b-kept~${hidden!.slug}~open`);
  await expect(lit(guest)).toHaveCount(0);
  await expect(guest.locator('[data-block="kept"]')).toHaveCount(0);
  await expect(guest.locator('dialog[open]')).toHaveCount(0);
  await visitor.close();
});
