import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { expectPopupUsable } from './helpers/popup';

/**
 * The grid of blocks the "+" of the editor opens: a tile per block, its
 * name in a hint, the arrows across and down, a letter to a name, Enter to
 * put the block in — in place of an empty paragraph, after anything else —
 * and Escape back to the text. The tiles are rearranged by dragging or by
 * Alt and the arrows, and keep their order in this browser. Ctrl+Shift+/
 * opens it from the keyboard, for the block of the caret.
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

async function openEditor(page: Page, text = 'Hello world') {
  const stamp = Date.now();
  const result = await (
    await page.request.post('/api/admin/pages', {
      data: {
        title: `Block grid ${stamp}`,
        summary: 'A page for the block grid spec.',
        slug: `block-grid-${stamp}`,
        // Kept out of the public lists other specs read.
        access: 'private',
        content: {
          data: { blocks: [{ type: 'paragraph', data: { text } }] },
        },
        reminder: '',
        notes: null,
      },
    })
  ).json();
  expect(result.type, JSON.stringify(result)).toBe('success');
  await page.goto(`/admin/pages/${result.pageUuid}/edit/`);
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-field]').first().click();
  await expect(blocks(page).first()).toBeVisible({ timeout: 15_000 });
}

const blocks = (page: Page) => page.locator('dialog .content-editor .ce-block');
const tiles = (page: Page) => page.locator('dialog [data-block-tile]');
const tile = (page: Page, key: string) =>
  page.locator(`dialog [data-block-tile="${key}"]`);
const grid = (page: Page) =>
  page
    .locator('[data-floating-popup]')
    .filter({ has: page.locator('[data-block-toolbox]') });

/** An empty paragraph after the last block, the caret in it. */
async function newParagraph(page: Page) {
  await blocks(page).last().locator('[contenteditable]').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(
    blocks(page).last().locator('[contenteditable]').first(),
  ).toBeFocused();
}

/** Opens the grid from the "+" beside the last block. */
async function openGrid(page: Page) {
  await blocks(page).last().hover();
  const plus = page.locator('dialog .ce-toolbar__plus');
  // Editor.js moves its toolbar to the block a moment later — beside it on
  // a computer, under it on a phone: it is there once it stops moving.
  let before: number | undefined;
  await expect
    .poll(async () => {
      const y = (await plus.boundingBox())?.y;
      const still = y !== undefined && y === before;
      before = y;
      return still;
    })
    .toBe(true);
  await plus.click();
  await expect(tiles(page).first()).toBeFocused();
}

async function tileOrder(page: Page) {
  return tiles(page).evaluateAll((all) =>
    all.map((item) => (item as HTMLElement).dataset.blockTile),
  );
}

test('the arrows go across and down, a letter to a name, and Enter puts the block in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() =>
    localStorage.removeItem('thei-editor-toolbox'),
  );
  await openEditor(page);
  await newParagraph(page);
  const count = await blocks(page).count();
  await openGrid(page);
  const order = await tileOrder(page);
  expect(order.slice(0, 4)).toEqual([
    'paragraph',
    'header:0',
    'header:1',
    'list',
  ]);

  await page.keyboard.press('ArrowDown');
  await expect(tiles(page).nth(4)).toBeFocused();
  // Its name is its hint.
  await expect(page.locator('[data-title-popup-el]')).toHaveText('Quote');
  await page.keyboard.press('ArrowRight');
  await expect(tiles(page).nth(5)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(tiles(page).nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(tiles(page).last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tiles(page).first()).toBeFocused();
  // A letter goes to the next block whose name starts with it.
  await page.keyboard.press('q');
  await expect(tile(page, 'quote')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(grid(page)).toHaveCount(0);
  await expect(blocks(page).last().locator('.cdx-quote')).toBeVisible();
  expect(await blocks(page).count()).toBe(count);
  await expect(blocks(page).last().locator('.cdx-quote__text')).toBeFocused();
});

test('Escape closes the grid and gives the caret back', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  await newParagraph(page);
  await openGrid(page);
  await page.keyboard.press('Escape');
  await expect(grid(page)).toHaveCount(0);
  await expect(page.locator('dialog .content-editor')).toBeVisible();
  await expect(
    blocks(page).last().locator('[contenteditable]').first(),
  ).toBeFocused();
});

test('a divider at the end is followed by a new paragraph, and a private section by its end', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  await newParagraph(page);
  await openGrid(page);
  await tile(page, 'delimiter').click();
  await expect(blocks(page).nth(1).locator('.content-divider')).toBeVisible();
  await expect(blocks(page)).toHaveCount(3);
  await expect(
    blocks(page).last().locator('[contenteditable]').first(),
  ).toBeFocused();

  await openGrid(page);
  await tile(page, 'privateSectionBoundary').click();
  await expect(
    page.locator('dialog .ce-block[data-private-section-edge]'),
  ).toHaveCount(2);
});

test('the link tile opens the link picker', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  await newParagraph(page);
  await openGrid(page);
  await tile(page, 'entityLink').click();
  await expect(page.locator('dialog [data-link-picker="block"]')).toBeVisible();
  await expect(page.locator('dialog [data-link-field]')).toBeFocused();
});

test('Ctrl+Shift+/ opens the grid for the block of the caret, not its settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  await newParagraph(page);
  await page.keyboard.press('Control+Shift+Slash');
  await expect(tiles(page).first()).toBeFocused();
  await expect(page.locator('.ce-popover--opened')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(blocks(page).last().locator('.ce-header')).toBeVisible();
});

test('the tiles keep the order they are given, in this browser', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('kept')) {
      localStorage.removeItem('thei-editor-toolbox');
      sessionStorage.setItem('kept', '1');
    }
  });
  await openEditor(page);
  await newParagraph(page);
  await openGrid(page);
  const before = await tileOrder(page);

  // Alt and an arrow move the tile, the focus going with it.
  await page.keyboard.press('Alt+ArrowRight');
  await expect(tile(page, before[0]!)).toBeFocused();
  expect((await tileOrder(page)).slice(0, 2)).toEqual([before[1], before[0]]);

  // Dragged by the mouse, as a hand does: the sorter follows the pointer on
  // a clock of its own.
  const from = (await tile(page, before[11]!).boundingBox())!;
  const to = (await tiles(page).first().boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + 6, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 20; step++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * step) / 20,
      start.y + ((end.y - start.y) * step) / 20,
    );
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect.poll(async () => (await tileOrder(page))[0]).toBe(before[11]);
  const after = await tileOrder(page);
  // A drop is no choice: the grid is still open.
  await expect(grid(page)).toHaveCount(1);

  // Kept across a reload.
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-field]').first().click();
  await expect(blocks(page).first()).toBeVisible({ timeout: 15_000 });
  await newParagraph(page);
  await openGrid(page);
  expect(await tileOrder(page)).toEqual(after);
});

test.describe('on a phone, by touch', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });

  test('a long press names a tile, and a tap puts its block in', async ({
    page,
  }) => {
    await openEditor(page);
    await newParagraph(page);
    await page.locator('dialog .ce-toolbar__plus').tap();
    await expect(grid(page)).toBeVisible();
    const quote = tile(page, 'quote');
    const box = (await quote.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const at = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: at,
    });
    // Named while the finger is still on it.
    await expect(page.locator('[data-title-popup-el]')).toHaveText('Quote');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
    // Held, it was only named: nothing was put in.
    await expect(grid(page)).toBeVisible();
    await expect(blocks(page).locator('.cdx-quote')).toHaveCount(0);

    await quote.tap();
    await expect(grid(page)).toHaveCount(0);
    await expect(blocks(page).last().locator('.cdx-quote')).toBeVisible();
  });
});

for (const [name, size] of [
  ['computer', { width: 1280, height: 800 }],
  ['phone', { width: 375, height: 812 }],
] as const)
  test(`the grid opens whole and on top (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    await openEditor(page);
    await newParagraph(page);
    await openGrid(page);
    await expectPopupUsable(page, grid(page));
    // The hint stands over the grid, inside the dialog.
    await page.keyboard.press('ArrowDown');
    const hint = page.locator('[data-title-popup-el]');
    await expect(hint).toBeVisible();
    expect(
      await hint.evaluate((element) =>
        Boolean(element.closest('dialog[open]')),
      ),
    ).toBe(true);
  });
