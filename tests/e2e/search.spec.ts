import {
  expect,
  request as playwright,
  test,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

/**
 * The site's one search, as a stranger meets it: the quick search opened by
 * its icon and its keys — on any keyboard layout, never over a modal, "/"
 * never in a field — the row Enter takes ringed, a find landing on its place
 * out of the spoiler that hid it, and the search page's cards.
 */

const adminState = fileURLToPath(
  new URL('./.artifacts/admin.json', import.meta.url),
);

// A word no other text holds, of letters alone.
const WORD = `zq${Date.now()
  .toString(36)
  .replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)]!)}`;
// The title holds a word of its own: the word sought stands only under the
// spoiler, so that is the place found best.
const TITLE = `Lantern fair ${WORD.slice(2).split('').reverse().join('')}`;

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const field = (page: Page) => page.getByRole('combobox');

test.beforeAll(async () => {
  const owner = await playwright.newContext({
    baseURL: E2E_ORIGIN,
    storageState: adminState,
  });
  const body = await (
    await owner.post('/api/admin/events', {
      data: {
        title: TITLE,
        summary: 'Paper lanterns over the river.',
        access: 'public',
        humanReadableSlug: 'lantern-fair',
        publicId: `lf${WORD}`,
        content: {
          data: {
            blocks: [
              { id: 'open1', type: 'paragraph', data: { text: 'We walked.' } },
              {
                id: 'hidden1',
                type: 'paragraph',
                data: { text: `Under the spoiler: the ${WORD} lantern won.` },
                tunes: { spoiler: true },
              },
            ],
          },
        },
        periods: [{ startDate: '2024-09-21', endDate: '2024-09-21' }],
      },
    })
  ).json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  await owner.dispose();
  // The index takes a saved entity in once the writing pauses.
  const stranger = await playwright.newContext({ baseURL: E2E_ORIGIN });
  await expect
    .poll(
      async () =>
        (await (await stranger.get(`/api/search?q=${WORD}`)).json()).total,
      { timeout: 30_000, intervals: [500] },
    )
    .toBeGreaterThan(0);
  await stranger.dispose();
});

test('Ctrl+K opens the search on any layout, never over a modal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, '/');
  // On a Russian layout the K key types «л»: the chord is its key.
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'л',
        code: 'KeyK',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(field(page)).toBeHidden();

  // A modal in front keeps its keys.
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'in-front';
    document.body.append(dialog);
    dialog.showModal();
  });
  await page.keyboard.press('Control+KeyK');
  await expect(field(page)).toBeHidden();
  await page.evaluate(() =>
    (document.getElementById('in-front') as HTMLDialogElement).close(),
  );

  // "/" opens it, but types itself in a field.
  await page.keyboard.press('/');
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'typing';
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press('/');
  await expect(page.locator('#typing')).toHaveValue('/');
  await expect(field(page)).toBeHidden();
});

for (const width of [1280, 375]) {
  test(`a find lands on its place out of its spoiler at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, '/');
    await page.locator('[data-site-search]').first().click();
    await field(page).fill(WORD);
    const first = page.getByRole('option').first();
    await expect(first).toContainText(TITLE);
    // The row Enter takes is ringed before any key chose it.
    await expect(first).toHaveAttribute('data-active', 'true');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/#b-hidden1/);
    const block = page.locator('[data-block="hidden1"]');
    await expect(block).toHaveAttribute('data-search-found', '');
    await expect(page.locator('.content-spoiler')).toHaveAttribute(
      'data-revealed',
      'true',
    );
    await expect(block).toBeInViewport();
  });
}

/** A reader's history as this browser keeps it, by whose it is. */
async function storedHistory(page: Page, reader: 'owner' | 'visitor') {
  return page.evaluate((suffix) => {
    const key = Object.keys(localStorage).find(
      (each) =>
        each.startsWith('thei:search-history:v1:') && each.endsWith(suffix),
    );
    return key ? (JSON.parse(localStorage.getItem(key)!) as string[]) : null;
  }, `:${reader}`);
}

test('the quick search offers what was searched for before', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const asked: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/search')
      asked.push(request.url());
  });
  await open(page, '/');
  await page.locator('[data-site-search]').first().click();
  await expect(field(page)).toBeFocused();
  // Nothing searched for yet: a line of what the search finds, and nothing
  // asked of the server.
  await expect(page.locator('[data-search-hint]')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
  expect(asked).toEqual([]);

  await field(page).fill(WORD);
  await expect(page.getByRole('option').first()).toContainText(TITLE);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#b-hidden1/);

  // A query that finds nothing says so and no more, here and on the page.
  const nothing = `nothing${WORD} `.repeat(20).slice(0, 200).trim();
  await page.locator('[data-site-search]').first().click();
  await field(page).fill(nothing);
  await expect(page.locator('[data-search-empty]')).toHaveText('Nothing found');
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Control+Enter');
  await expect(page).toHaveURL(/\/search\/\?q=/);
  await expect(page.locator('main').getByText('Nothing found')).toBeVisible();
  await expect(page.locator('main section[aria-live] a')).toHaveCount(0);
  expect(await storedHistory(page, 'visitor')).toEqual([nothing, WORD]);

  await open(page, '/');
  await page.locator('[data-site-search]').first().click();
  await expect(page.locator('[data-search-history]')).toContainText(
    'You searched for',
  );
  await expect(page.locator('[data-search-hint]')).toHaveCount(0);
  const rows = page.getByRole('option');
  await expect(rows).toHaveCount(2);
  // No row is ringed until the keys go there: Enter in the empty field
  // searches for nothing.
  await expect(page.locator('[role="option"][data-active]')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveValue('');
  await page.keyboard.press('Tab');
  await expect(rows.first()).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Enter');
  // Searched for again, where it was offered.
  await expect(field(page)).toHaveValue(WORD);
  await expect(field(page)).toBeFocused();
  await expect(rows.first()).toContainText(TITLE);

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(rows.first()).toContainText(WORD);
  // A query too long for its row reads whole in its hint.
  const long = rows.nth(1).locator('[data-title-popup-clipped]');
  await expect(long).toHaveAttribute('data-title-popup', nothing);
  await long.hover();
  await expect(page.locator('[data-title-popup-el]')).toContainText(
    nothing.slice(0, 40),
  );

  // The bin forgets them all.
  await page.locator('[data-search-history-clear]').click();
  await expect(page.locator('[data-search-history]')).toHaveCount(0);
  await expect(page.locator('[data-search-hint]')).toBeVisible();
  await expect(field(page)).toBeFocused();
  expect(await storedHistory(page, 'visitor')).toBeNull();
});

test("the owner's searches are kept apart from a visitor's", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: E2E_ORIGIN,
    storageState: adminState,
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, '/');
  await page.evaluate(() =>
    localStorage.setItem(
      'thei:search-history:v1:/:visitor',
      JSON.stringify(['a visitor’s query']),
    ),
  );
  await page.locator('[data-site-search]').first().click();
  // The owner is offered what to do, and none of a visitor's queries.
  await expect(page.getByRole('option').first()).toBeVisible();
  await expect(page.locator('[data-search-history]')).toHaveCount(0);
  await field(page).fill(WORD);
  // On the site the owner's Enter opens the page, not its editor.
  await expect(page.getByRole('option').first()).toContainText(TITLE);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#b-hidden1/);
  expect(await storedHistory(page, 'owner')).toEqual([WORD]);
  expect(await storedHistory(page, 'visitor')).toEqual(['a visitor’s query']);

  // The owner's own come last, after what there is to do.
  await page.locator('[data-site-search]').first().click();
  await field(page).fill('');
  await expect(page.locator('[data-search-history]')).toBeVisible();
  await expect(page.getByRole('option').last()).toContainText(WORD);
  await context.close();
});

test('the search page shows a card with its places and kinds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `/search/?q=${WORD}`);
  const card = page.locator('article').filter({ hasText: TITLE });
  await expect(card).toBeVisible();
  await expect(card.getByRole('link').last()).toHaveAttribute(
    'href',
    /#b-hidden1/,
  );
  await expect(page.getByRole('button', { name: /Events\s*1/ })).toBeVisible();
  // A search says how many it found on its chips alone.
  await expect(page.getByText(/^Found \d+ result/)).toHaveCount(0);
});
