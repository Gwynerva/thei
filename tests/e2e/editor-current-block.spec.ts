import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The current block of the editor: the one the keyboard is in. It glows, and
 * Enter there adds a paragraph right after it — on a picture, beside it, in a
 * caption, on a divider — while Enter in text stays Editor.js's own.
 */

const PICTURE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>';

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  // Editor.js throws from `split()` when Enter reaches a block it cannot
  // split; nothing may be thrown at all.
  expect(errors).toEqual([]);
});

async function openFixture(page: Page) {
  await page.route('**/slow-image.svg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: PICTURE }),
  );
  await page.goto('/editor-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(
    page.locator('[data-media-final-state="visible"]').first(),
  ).toBeVisible();
  await expect(state(page)).toHaveAttribute('data-snapshot-pending', 'false');
}

const state = (page: Page) => page.locator('[data-ready]');
const block = (page: Page, id: string) =>
  page.locator(`.ce-block[data-id="${id}"]`);
const events = async (page: Page) =>
  Number(await state(page).getAttribute('data-events'));
const blockCount = (page: Page) =>
  page.locator('.codex-editor .ce-block').count();

/** The ids of the blocks that glow; settled, as the glow fades. */
function glowing(page: Page) {
  return page
    .locator('.codex-editor .ce-block')
    .evaluateAll((blocks) =>
      blocks
        .filter((item) => getComputedStyle(item, '::before').opacity !== '0')
        .map((item) => (item as HTMLElement).dataset.id),
    );
}

async function expectCurrent(page: Page, id: string) {
  await expect
    .poll(() =>
      block(page, id).evaluate((item) => item.contains(document.activeElement)),
    )
    .toBe(true);
  await expect.poll(() => glowing(page)).toEqual([id]);
}

/** What follows a block: a new paragraph is empty and has the caret. */
function blockAfter(page: Page, id: string) {
  return block(page, id).evaluate((item) => {
    const next = item.nextElementSibling;
    return {
      paragraph: Boolean(next?.querySelector('.ce-paragraph')),
      text: next?.textContent ?? null,
      focused: Boolean(next?.contains(document.activeElement)),
    };
  });
}

const NEW_PARAGRAPH = { paragraph: true, text: '', focused: true };

/**
 * An empty paragraph is no content: adding one changes nothing that is kept,
 * yet Editor.js reports it, once.
 */
async function expectEmptyParagraphAdded(page: Page, before: number) {
  await expect.poll(() => events(page)).toBe(before + 1);
  await page.waitForTimeout(500);
  expect(await events(page)).toBe(before + 1);
  await expect(state(page)).toHaveAttribute('data-transitions', '');
  await expect(page.locator('[data-save]')).toHaveText('Saved');
}

/** The picture of the media block, as shown. */
const picture = (page: Page) =>
  block(page, 'media').locator('[data-media-main]').first();

/** The point just beside a block's column, inside the block. */
async function besideBlock(locator: Locator) {
  const content = (await locator.locator('.ce-block__content').boundingBox())!;
  return { x: content.x - 12, y: content.y + content.height / 2 };
}

test.describe('on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFixture(page);
  });

  test('a click on a picture, beside it, on a divider or on a bracket makes the block current, and Enter adds a paragraph after it', async ({
    page,
  }) => {
    const targets: [string, (page: Page) => Promise<void>][] = [
      [
        'media',
        async (page) => {
          const box = (await picture(page).boundingBox())!;
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        },
      ],
      [
        'media',
        async (page) => {
          const point = await besideBlock(block(page, 'media'));
          await page.mouse.click(point.x, point.y);
        },
      ],
      ['divider', (page) => block(page, 'divider').click()],
      ['s1', (page) => block(page, 's1').click()],
    ];
    for (const [id, click] of targets) {
      await openFixture(page);
      const before = await events(page);
      await block(page, id).scrollIntoViewIfNeeded();
      await click(page);
      await expectCurrent(page, id);
      // Choosing a block is no change.
      await page.waitForTimeout(500);
      expect(await events(page)).toBe(before);
      await expect(state(page)).toHaveAttribute('data-transitions', '');

      await page.keyboard.press('Enter');
      expect(await blockAfter(page, id)).toEqual(NEW_PARAGRAPH);
      await expectEmptyParagraphAdded(page, before);
      await page.keyboard.type('Next');
      await expect(page.locator('[data-save]')).toHaveText('Save');
    }
  });

  test('Enter in a caption adds a paragraph after the block and leaves the caption whole', async ({
    page,
  }) => {
    const caption = block(page, 'gallery').locator('[contenteditable="true"]');
    await caption.scrollIntoViewIfNeeded();
    const count = await blockCount(page);
    // At the start, inside and at the end: Editor.js would split it at the
    // caret and carry the rest off into the new paragraph.
    const places = [['Home'], ['Home', 'ArrowRight', 'ArrowRight'], ['End']];
    for (const [index, keys] of places.entries()) {
      await caption.click();
      for (const key of keys) await page.keyboard.press(key);
      await page.keyboard.press('Enter');
      expect(await blockAfter(page, 'gallery')).toEqual(NEW_PARAGRAPH);
      await expect(caption).toHaveText('first');
      expect(await blockCount(page)).toBe(count + index + 1);
    }
    await expect(state(page)).toHaveAttribute('data-transitions', '');
  });

  test('a caption of a block added in this session takes Enter the same way', async ({
    page,
  }) => {
    // The toolbox's way: Editor.js reads the fields of a placeholder, and the
    // caption appears only once a picture is chosen.
    await page.getByRole('button', { name: 'Insert media' }).click();
    await page.getByRole('button', { name: 'Choose picture' }).click();
    const id = await page
      .locator('.codex-editor .ce-block')
      .last()
      .getAttribute('data-id');
    const added = block(page, id!);
    const caption = added.locator('[contenteditable="true"]');
    await caption.scrollIntoViewIfNeeded();
    await caption.click();
    await page.keyboard.type('Fresh caption');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const count = await blockCount(page);
    await page.keyboard.press('Enter');
    await expect(caption).toHaveText('Fresh caption');
    expect(await blockCount(page)).toBe(count + 1);
    const next = await added.evaluate((item) => ({
      paragraph: Boolean(
        item.nextElementSibling?.querySelector('.ce-paragraph'),
      ),
      focused: Boolean(
        item.nextElementSibling?.contains(document.activeElement),
      ),
    }));
    expect(next).toEqual({ paragraph: true, focused: true });
  });

  test('a caption with text selected under the inline toolbar keeps Enter to itself', async ({
    page,
  }) => {
    const caption = block(page, 'gallery').locator('[contenteditable="true"]');
    await caption.scrollIntoViewIfNeeded();
    await caption.click();
    await page.keyboard.press('End');
    for (let step = 0; step < 3; step++)
      await page.keyboard.press('Shift+ArrowLeft');
    await expect(
      page
        .locator('.ce-popover--inline.ce-popover--opened .ce-popover-item')
        .first(),
    ).toBeVisible();
    const count = await blockCount(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await expect(caption).toHaveText('first');
    expect(await blockCount(page)).toBe(count);
  });

  test('Enter in the settings of a gallery opened from its caption is the menu’s', async ({
    page,
  }) => {
    const caption = block(page, 'gallery').locator('[contenteditable="true"]');
    await caption.scrollIntoViewIfNeeded();
    await caption.click();
    await page.keyboard.press('Control+Slash');
    await expect(
      page.locator('.ce-popover--opened .ce-popover-item').first(),
    ).toBeVisible();
    // Opening them selects the block they are for.
    await expect(block(page, 'gallery')).toHaveClass(/ce-block--selected/);
    const count = await blockCount(page);
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press('ArrowDown');
      const name = await page
        .locator('.ce-popover--opened .ce-popover-item--focused')
        .getAttribute('data-item-name');
      if (name === 'move-up') break;
    }
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        block(page, 'media').evaluate(
          (item) => (item.previousElementSibling as HTMLElement)?.dataset.id,
        ),
      )
      .toBe('gallery');
    expect(await blockCount(page)).toBe(count);
    await expect(caption).toHaveText('first');
  });

  test('the caption of a quote is one line: Enter leaves it, Shift+Enter breaks it', async ({
    page,
  }) => {
    const caption = block(page, 'quote').locator('.cdx-quote__caption');
    await caption.scrollIntoViewIfNeeded();
    await caption.click();
    await page.keyboard.press('End');
    const count = await blockCount(page);
    await page.keyboard.press('Enter');
    expect(await blockAfter(page, 'quote')).toEqual(NEW_PARAGRAPH);
    await expect(caption).toHaveText('Someone');

    await caption.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await expect
      .poll(() => caption.evaluate((item) => item.querySelector('br') !== null))
      .toBe(true);
    expect(await blockCount(page)).toBe(count + 1);
  });

  test('a tile clicked moves on with Enter; a tile reached with the keyboard is chosen by it', async ({
    page,
  }) => {
    const gallery = block(page, 'gallery');
    const tiles = gallery.locator('[data-drag-id]');
    await gallery.scrollIntoViewIfNeeded();
    await tiles.nth(1).click();
    await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expectCurrent(page, 'gallery');
    await page.keyboard.press('Enter');
    expect(await blockAfter(page, 'gallery')).toEqual(NEW_PARAGRAPH);

    // From the block itself, Tab reaches the first tile, and Enter is its own.
    const point = await besideBlock(gallery);
    await page.mouse.click(point.x, point.y);
    await expectCurrent(page, 'gallery');
    const count = await blockCount(page);
    await page.keyboard.press('Tab');
    await expect(tiles.nth(0)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tiles.nth(0)).toHaveAttribute('aria-pressed', 'true');
    expect(await blockCount(page)).toBe(count);
  });

  test('the arrows select a divider, and Enter adds a paragraph after it', async ({
    page,
  }) => {
    const quote = block(page, 'quote').locator('.cdx-quote__text');
    await quote.scrollIntoViewIfNeeded();
    await quote.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await expect(block(page, 'divider')).toHaveClass(/ce-block--selected/);
    // A selected block has its own look instead of the glow.
    await expect.poll(() => glowing(page)).toEqual([]);
    await page.keyboard.press('Enter');
    expect(await blockAfter(page, 'divider')).toEqual(NEW_PARAGRAPH);
    await expect(page.locator('.ce-block--selected')).toHaveCount(0);
  });

  test('Enter over blocks framed from beside a picture adds a paragraph after them, and Backspace removes them', async ({
    page,
  }) => {
    const media = block(page, 'media');

    // From the margin beside the picture, down into the gallery's column: the
    // frame selects what it crosses. The picture is put clear of the sticky
    // bar of buttons first.
    async function frame() {
      await media.evaluate((item) => item.scrollIntoView({ block: 'center' }));
      const content = (await media
        .locator('.ce-block__content')
        .boundingBox())!;
      const gallery = (await block(page, 'gallery').boundingBox())!;
      // Left of the toolbar's buttons, which stand in the margin too.
      const from = { x: content.x - 90, y: content.y + 10 };
      const to = { x: content.x + 40, y: gallery.y + 20 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      // Editor.js reads the pointer ten times a second at most.
      for (let step = 1; step <= 10; step++) {
        await page.mouse.move(
          from.x + ((to.x - from.x) * step) / 10,
          from.y + ((to.y - from.y) * step) / 10,
        );
        await page.waitForTimeout(20);
      }
      await page.mouse.up();
      await expect(page.locator('.ce-block--selected')).toHaveCount(2);
    }

    // Editor.js would take Enter as typed over the blocks, and replace them.
    await frame();
    const count = await blockCount(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('.ce-block--selected')).toHaveCount(0);
    expect(await blockAfter(page, 'gallery')).toEqual(NEW_PARAGRAPH);
    await expect(block(page, 'media')).toHaveCount(1);
    expect(await blockCount(page)).toBe(count + 1);

    await frame();
    await page.keyboard.press('Backspace');
    await expect(block(page, 'media')).toHaveCount(0);
    await expect(block(page, 'gallery')).toHaveCount(0);
  });

  test('a paste on a block that has the focus itself goes nowhere', async ({
    page,
  }) => {
    const media = block(page, 'media');
    await media.scrollIntoViewIfNeeded();
    const point = await besideBlock(media);
    await page.mouse.click(point.x, point.y);
    await expectCurrent(page, 'media');
    const before = await events(page);
    const count = await blockCount(page);
    for (const kind of ['text', 'lines', 'address', 'picture'] as const) {
      await page.evaluate((kind) => {
        const data = new DataTransfer();
        if (kind === 'text') data.setData('text/plain', 'Pasted');
        if (kind === 'lines') data.setData('text/plain', 'One\n\nTwo\n\nThree');
        if (kind === 'address')
          data.setData('text/plain', 'https://example.com/page');
        if (kind === 'picture')
          data.items.add(
            new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'a.svg', {
              type: 'image/svg+xml',
            }),
          );
        document.activeElement!.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, kind);
    }
    await page.waitForTimeout(500);
    expect(await blockCount(page)).toBe(count);
    expect(await events(page)).toBe(before);
  });

  test('Enter in a paragraph is still Editor.js’s: before at the start, after at the end, a split inside', async ({
    page,
  }) => {
    await block(page, 'p0').locator('[contenteditable]').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(block(page, 'p0')).toHaveText('Before');
    expect(
      await block(page, 'p0').evaluate((item) => ({
        before: item.previousElementSibling?.textContent,
        focused: item.contains(document.activeElement),
      })),
    ).toEqual({ before: '', focused: true });

    const last = block(page, 'p4');
    await last.scrollIntoViewIfNeeded();
    await last.locator('[contenteditable]').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    expect(await blockAfter(page, 'p4')).toEqual(NEW_PARAGRAPH);

    const between = block(page, 'p2');
    await between.scrollIntoViewIfNeeded();
    await between.locator('[contenteditable]').click();
    await page.keyboard.press('Home');
    for (let step = 0; step < 4; step++)
      await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(between).toHaveText('Betw');
    expect(await blockAfter(page, 'p2')).toEqual({
      paragraph: true,
      text: 'een',
      focused: true,
    });
  });

  test('only blocks without text take the focus, after a move, a new section and a restore too', async ({
    page,
  }) => {
    const focusable = () =>
      page.locator('.codex-editor .ce-block').evaluateAll((blocks) =>
        blocks.map((item) => ({
          text: Boolean(item.querySelector('.ce-paragraph, .cdx-quote')),
          tabindex: item.getAttribute('tabindex'),
        })),
      );
    const expectFocusable = async () => {
      for (const item of await focusable())
        expect(item.tabindex).toBe(item.text ? null : '-1');
    };
    await expectFocusable();
    await page.getByRole('button', { name: 'Valid move', exact: true }).click();
    await expect(page.locator('[data-save]')).toHaveText('Save');
    await expectFocusable();
    await block(page, 'p0').locator('[contenteditable]').click();
    await page.getByRole('button', { name: 'Insert section' }).click();
    await expect(page.locator('[data-private-section-id="new"]')).toHaveCount(
      2,
    );
    await expectFocusable();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(state(page)).toHaveAttribute('data-snapshot-pending', 'false');
    await expect(page.locator('[data-private-section-id="new"]')).toHaveCount(
      0,
    );
    await expectFocusable();
  });
});

test.describe('on a phone, by touch', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await openFixture(page);
  });

  test('a tap on a picture, a divider, a bracket or a gallery makes it current', async ({
    page,
  }) => {
    const before = await events(page);
    // The middle of the picture; a corner of the rest — of the gallery, its
    // padding rather than a tile.
    const taps: [string, Locator, 'middle' | 'corner'][] = [
      ['media', picture(page), 'middle'],
      ['divider', block(page, 'divider'), 'corner'],
      ['s1', block(page, 's1'), 'corner'],
      [
        'gallery',
        block(page, 'gallery').locator('[data-content-gallery]'),
        'corner',
      ],
    ];
    for (const [id, target, where] of taps) {
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      if (where === 'middle')
        await page.touchscreen.tap(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
      else await page.touchscreen.tap(box.x + 3, box.y + 3);
      await expectCurrent(page, id);
    }
    await page.waitForTimeout(500);
    expect(await events(page)).toBe(before);
    await expect(state(page)).toHaveAttribute('data-transitions', '');
  });

  test('Enter after a tap on a caption or a tile adds one paragraph after the gallery', async ({
    page,
  }) => {
    const gallery = block(page, 'gallery');
    const caption = gallery.locator('[contenteditable="true"]');
    await caption.scrollIntoViewIfNeeded();
    await caption.tap();
    await expectCurrent(page, 'gallery');
    await page.keyboard.press('End');
    const count = await blockCount(page);
    await page.keyboard.press('Enter');
    expect(await blockAfter(page, 'gallery')).toEqual(NEW_PARAGRAPH);
    await expect(caption).toHaveText('first');

    await gallery.locator('[data-drag-id]').nth(1).tap();
    await expectCurrent(page, 'gallery');
    await page.keyboard.press('Enter');
    expect(await blockAfter(page, 'gallery')).toEqual(NEW_PARAGRAPH);

    // A phone's keyboard may ask for a paragraph with no key at all.
    await caption.tap();
    await page.keyboard.press('End');
    await caption.evaluate((item) =>
      item.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertParagraph',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(await blockAfter(page, 'gallery')).toEqual(NEW_PARAGRAPH);
    await expect(caption).toHaveText('second');
    expect(await blockCount(page)).toBe(count + 3);
  });

  test('a swipe across the blocks scrolls without choosing one', async ({
    page,
  }) => {
    const gallery = block(page, 'gallery');
    const tiles = gallery.locator('[data-drag-id]');
    await gallery.scrollIntoViewIfNeeded();
    await tiles.nth(1).tap();
    await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await expect.poll(() => glowing(page)).toEqual([]);

    // A finger that starts on the divider and pulls the page down. (A tile
    // of a gallery being edited is dragged by a finger, not scrolled.)
    const divider = block(page, 'divider');
    await divider.evaluate((item) => item.scrollIntoView({ block: 'center' }));
    const box = (await divider.boundingBox())!;
    const scrolled = await page.evaluate(() => window.scrollY);
    const touch = await page.context().newCDPSession(page);
    const x = Math.round(box.x + box.width / 2);
    let y = Math.round(box.y + box.height / 2);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    // At a finger's pace: the browser takes the moves for a scroll.
    for (let step = 0; step < 15; step++) {
      y += 15;
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y }],
      });
      await page.waitForTimeout(16);
    }
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .not.toBe(scrolled);
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('.ce-block')),
      ),
    ).toBe(false);
    expect(await glowing(page)).toEqual([]);

    // Nothing of the swipe is left over: a tile reached with the keyboard
    // afterwards is chosen by Enter, not stepped past.
    await gallery.evaluate((item) => (item as HTMLElement).focus());
    const count = await blockCount(page);
    await page.keyboard.press('Tab');
    await expect(tiles.nth(0)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tiles.nth(0)).toHaveAttribute('aria-pressed', 'true');
    expect(await blockCount(page)).toBe(count);
  });
});

test.describe('in the text editor of a page', () => {
  test.use({
    storageState: fileURLToPath(
      new URL('./.artifacts/admin.json', import.meta.url),
    ),
  });

  async function openEditor(
    page: Page,
    name: string,
    blocks: object[] = [
      { type: 'paragraph', data: { text: 'Hello world' } },
      { type: 'delimiter', data: {} },
      { type: 'paragraph', data: { text: 'The end' } },
    ],
  ) {
    const slug = `current-block-${name}-${Date.now()}`;
    const response = await page.request.post('/api/admin/pages', {
      data: {
        title: `Current block ${name}`,
        summary: 'A page for the current block spec.',
        slug,
        access: 'public',
        content: { data: { blocks } },
        reminder: '',
        notes: null,
      },
    });
    const result = await response.json();
    expect(result.type, JSON.stringify(result)).toBe('success');
    await page.goto(`/admin/pages/${result.pageUuid}/edit/`);
    await page.waitForLoadState('networkidle');
    await page.locator('button[data-field]').first().click();
    await expect(
      page.locator('dialog .content-editor [contenteditable="true"]').first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  const editorBlocks = (page: Page) =>
    page.locator('dialog .content-editor .ce-block');

  /**
   * Answers reads of external sites in place of the sites, which are slow or
   * out of reach at times, and lists the addresses read.
   */
  async function stubExternalLinks(page: Page) {
    const reads: string[] = [];
    await page.route('**/api/admin/external-links', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return await route.fallback();
      const url = (request.postDataJSON() as { url: string }).url;
      reads.push(url);
      await route.fulfill({
        json: {
          url,
          title: `Stubbed ${new URL(url).pathname}`,
          faviconMedia: {
            kind: 'image',
            src: '/favicon.ico',
            previewSrc: '/favicon.ico',
          },
          status: 'complete',
          touchedAt: Date.now(),
        },
      });
    });
    return reads;
  }

  test('dragging a block to the edge of the modal scrolls it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await openEditor(
      page,
      'drag-scroll',
      Array.from({ length: 40 }, (_, index) => ({
        type: 'paragraph',
        data: { text: `Paragraph ${index + 1}` },
      })),
    );
    const blocks = editorBlocks(page);
    await expect(blocks).toHaveCount(40);
    const scroller = page.locator('dialog section > div.overflow-auto');
    const scrollTop = () => scroller.evaluate((element) => element.scrollTop);
    expect(await scrollTop()).toBe(0);

    // The settings button appears beside the hovered block and is the handle.
    await blocks.first().hover();
    const handle = page.locator('dialog .ce-toolbar__settings-btn');
    await expect(handle).toBeVisible();
    const handleBox = (await handle.boundingBox())!;
    const scrollerBox = (await scroller.boundingBox())!;
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    const x = scrollerBox.x + scrollerBox.width / 2;
    const edge = scrollerBox.y + scrollerBox.height - 10;
    await page.mouse.move(handleBox.x + 30, handleBox.y + 30, { steps: 5 });
    await page.mouse.move(x, edge, { steps: 10 });

    // A held drag fires `dragover` only while the pointer moves, so it is
    // nudged; the scroller must reach its end from those frames alone.
    const atEnd = () =>
      scroller.evaluate(
        (element) =>
          element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
      );
    for (let step = 0; step < 300 && !(await atEnd()); step++) {
      await page.mouse.move(x + (step % 2), edge);
      await page.waitForTimeout(16);
    }
    expect(await scrollTop()).toBeGreaterThan(200);
    expect(await atEnd()).toBe(true);

    const lastBox = (await blocks.last().boundingBox())!;
    await page.mouse.move(x, lastBox.y + lastBox.height * 0.75, { steps: 5 });
    await page.mouse.up();

    await expect(blocks.last()).toHaveText('Paragraph 1');
    await expect(blocks.first()).toHaveText('Paragraph 2');
  });

  test('Enter in the link popup links the text and adds no block', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stubExternalLinks(page);
    await openEditor(page, 'link');
    const count = await editorBlocks(page).count();
    await editorBlocks(page).first().locator('[contenteditable]').click();
    await page.keyboard.press('End');
    for (let step = 0; step < 'world'.length; step++)
      await page.keyboard.press('Shift+ArrowLeft');
    const bold = page.locator(
      '.ce-popover--opened [data-item-name="contentBold"]',
    );
    const link = page.locator(
      '.ce-popover--opened [data-item-name="contentExternalInlineLink"]',
    );
    await expect(link).toBeVisible();

    // A button of the inline toolbar takes the focus for an instant and
    // gives it back: the glow of the block stays, without a flicker.
    const first = editorBlocks(page).first();
    await expect
      .poll(() =>
        first.evaluate((item) => getComputedStyle(item, '::before').opacity),
      )
      .toBe('1');
    await first.evaluate((item) => {
      item.dataset.glowFaded = 'false';
      item.addEventListener('transitionstart', (event) => {
        if ((event as TransitionEvent).pseudoElement === '::before')
          item.dataset.glowFaded = 'true';
      });
    });
    // Pressed as a hand does, not in one instant.
    await bold.hover();
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect(first.locator('b, strong')).toHaveText('world');
    await page.waitForTimeout(500);
    await expect(first).toHaveAttribute('data-glow-faded', 'false');
    await bold.click();
    await expect(first.locator('b, strong')).toHaveCount(0);

    await link.click();
    const address = page.locator('dialog input[inputmode="url"]');
    await expect(address).toBeFocused();
    await address.fill('https://example.com/');
    await page.keyboard.press('Enter');
    await expect(
      editorBlocks(page).first().locator('a[href="https://example.com/"]'),
    ).toHaveText('world');
    expect(await editorBlocks(page).count()).toBe(count);
  });

  /** Selects the last `length` characters of the first block. */
  async function selectEnd(page: Page, length: number) {
    await editorBlocks(page).first().locator('[contenteditable]').click();
    await page.keyboard.press('End');
    for (let step = 0; step < length; step++)
      await page.keyboard.press('Shift+ArrowLeft');
  }

  test('an address in the link popup is read once typing pauses, and at once when pasted', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const reads = await stubExternalLinks(page);
    await openEditor(page, 'typed-link');
    await selectEnd(page, 'world'.length);
    await page
      .locator(
        '.ce-popover--opened [data-item-name="contentExternalInlineLink"]',
      )
      .click();
    const address = page.locator('dialog input[inputmode="url"]');
    await expect(address).toBeFocused();

    // Typed without a pause: one read, of the whole address, while the field
    // keeps the focus and the text stays as typed.
    await address.pressSequentially('https://example.com/about', {
      delay: 20,
    });
    await expect(
      page.locator('dialog').getByText('Stubbed /about'),
    ).toBeVisible();
    expect(reads).toEqual(['https://example.com/about']);
    await expect(address).toBeFocused();
    await expect(address).toHaveValue('https://example.com/about');

    // Pasted: read as a finished address, tidied to the stored form.
    await address.fill('');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() =>
      navigator.clipboard.writeText('https://EXAMPLE.com/pasted'),
    );
    await address.press('Control+V');
    await expect(
      page.locator('dialog').getByText('Stubbed /pasted'),
    ).toBeVisible();
    await expect(address).toHaveValue('https://example.com/pasted');
    await expect(address).toBeFocused();
    expect(reads).toEqual([
      'https://example.com/about',
      'https://example.com/pasted',
    ]);
  });

  test('the internal link popup starts with what the selected words name', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const name = `Zephyrine${Date.now().toString(36)} Harbor`;
    const created = await page.request.post('/api/admin/pages', {
      data: {
        title: name,
        summary: 'A page the selected words name.',
        slug: `suggested-${Date.now()}`,
        access: 'public',
        content: {
          data: {
            blocks: [{ type: 'paragraph', data: { text: 'Named by words.' } }],
          },
        },
        reminder: '',
        notes: null,
      },
    });
    const result = await created.json();
    expect(result.type, JSON.stringify(result)).toBe('success');
    // The page being edited is newer, so only the words can put the other first.
    await openEditor(page, 'suggest', [
      { type: 'paragraph', data: { text: `We sailed to ${name}` } },
    ]);
    await selectEnd(page, name.length);
    await page
      .locator('.ce-popover--opened [data-item-name="contentEntityLink"]')
      .click();

    const search = page.locator('dialog input[type="search"]');
    const options = page.locator('dialog [role="option"]');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(options.first()).toContainText(name);
    await expect(options).toHaveCount(5);

    // Typing searches as it always does; an empty field suggests again.
    await search.fill('Current block suggest');
    await expect(options.first()).toContainText('Current block suggest');
    await search.fill('');
    await expect(options.first()).toContainText(name);

    await options.first().click();
    await page.keyboard.press('Enter');
    await expect(
      editorBlocks(page).first().locator('a[data-content-link="entity"]'),
    ).toHaveText(name);
  });

  test('Enter chooses from the toolbox and from a block’s settings, and adds no block', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openEditor(page, 'menus');
    await editorBlocks(page).last().locator('[contenteditable]').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const count = await editorBlocks(page).count();
    await expect(
      editorBlocks(page).last().locator('[contenteditable]'),
    ).toBeFocused();
    await page.waitForTimeout(300);
    await page.keyboard.type('/');
    await expect(
      page.locator('.ce-popover--opened .ce-popover-item').first(),
    ).toBeVisible();
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press('ArrowDown');
      const name = await page
        .locator('.ce-popover--opened .ce-popover-item--focused')
        .getAttribute('data-item-name');
      if (name === 'header') break;
    }
    await page.keyboard.press('Enter');
    await expect(editorBlocks(page).last().locator('.ce-header')).toBeVisible();
    expect(await editorBlocks(page).count()).toBe(count);

    // The settings of a block, from the keyboard: opening them selects the
    // block, and Enter is the menu's, not a new paragraph after the block.
    const first = editorBlocks(page).first();
    await first.locator('[contenteditable]').click();
    await page.keyboard.press('Control+Slash');
    await expect(
      page.locator('.ce-popover--opened .ce-popover-item').first(),
    ).toBeVisible();
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press('ArrowDown');
      const name = await page
        .locator('.ce-popover--opened .ce-popover-item--focused')
        .getAttribute('data-item-name');
      if (name === 'move-down') break;
    }
    await page.keyboard.press('Enter');
    await expect(
      editorBlocks(page).first().locator('.content-divider'),
    ).toBeVisible();
    await expect(editorBlocks(page).nth(1)).toHaveText('Hello world');
    expect(await editorBlocks(page).count()).toBe(count);
  });

  test.describe('on a phone', () => {
    test.use({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    });

    for (const width of [375, 320]) {
      test(`a tap beside a block at ${width}px focuses it or puts the caret by it, and nothing scrolls sideways`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 812 });
        await openEditor(page, `phone-${width}`);
        const holder = page.locator('dialog .content-editor');
        await expect(holder).toHaveAttribute(
          'data-content-editor-layout',
          'mobile',
        );
        const divider = editorBlocks(page).nth(1);
        const edge = (await holder.boundingBox())!;
        const dividerBox = (await divider.boundingBox())!;
        // The editor's own padding, beside the divider.
        await page.touchscreen.tap(
          edge.x + 3,
          dividerBox.y + dividerBox.height / 2,
        );
        await expect(divider).toBeFocused();
        await expect
          .poll(() =>
            divider.evaluate(
              (item) => getComputedStyle(item, '::before').opacity,
            ),
          )
          .toBe('1');

        // The glow reaches the edges of the editor and no further.
        const glow = await divider.evaluate((item) => {
          const style = getComputedStyle(item, '::before');
          const box = item.getBoundingClientRect();
          const left = box.left + parseFloat(style.left);
          return { left, right: left + parseFloat(style.width) };
        });
        expect(glow.left).toBeGreaterThanOrEqual(edge.x - 0.5);
        expect(glow.right).toBeLessThanOrEqual(edge.x + edge.width + 0.5);
        for (const scroller of [
          holder,
          page.locator('dialog:has(.content-editor)'),
        ])
          expect(
            await scroller.evaluate(
              (item) => item.scrollWidth - item.clientWidth,
            ),
          ).toBeLessThanOrEqual(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          ),
        ).toBeLessThanOrEqual(0);

        // The toolbar's buttons lie over the glow and still take a tap.
        const plus = page.locator('dialog .ce-toolbar__plus');
        await expect(plus).toBeVisible();
        const plusBox = (await plus.boundingBox())!;
        expect(
          await page.evaluate(
            ({ x, y }) =>
              Boolean(
                document.elementFromPoint(x, y)?.closest('.ce-toolbar__plus'),
              ),
            {
              x: plusBox.x + plusBox.width / 2,
              y: plusBox.y + plusBox.height / 2,
            },
          ),
        ).toBe(true);

        // Beside text, a tap still puts the caret at the start of the line.
        const text = editorBlocks(page).first().locator('[contenteditable]');
        const textBox = (await text.boundingBox())!;
        await page.touchscreen.tap(edge.x + 3, textBox.y + textBox.height / 2);
        await expect(text).toBeFocused();
        expect(
          await page.evaluate(() => window.getSelection()?.anchorOffset),
        ).toBe(0);
        await expect
          .poll(() =>
            editorBlocks(page)
              .first()
              .evaluate((item) => getComputedStyle(item, '::before').opacity),
          )
          .toBe('1');
      });
    }
  });
});
