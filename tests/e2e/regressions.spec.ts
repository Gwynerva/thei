import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const adminState = fileURLToPath(
  new URL('./.artifacts/admin.json', import.meta.url),
);

async function settleFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function waitForNuxtHydration(page: Page) {
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

test('home lays out three latest cards as one wide card and a pair', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const grid = page.locator('[data-home-card-grid="latest"]');
  const cards = grid.locator('[data-home-card]');
  await expect(cards).toHaveCount(3);
  const [gridBox, first, second, third] = await Promise.all([
    grid.boundingBox(),
    cards.nth(0).boundingBox(),
    cards.nth(1).boundingBox(),
    cards.nth(2).boundingBox(),
  ]);
  expect(first!.width).toBeCloseTo(gridBox!.width, 0);
  expect(second!.width).toBeCloseTo(third!.width, 0);
  expect(second!.y).toBeCloseTo(third!.y, 0);
});

test('home stacks its cards when a pair would leave each too narrow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto('/');
  const grid = page.locator('[data-home-card-grid="latest"]');
  const cards = grid.locator('[data-home-card]');
  await expect(cards).toHaveCount(3);
  const gridBox = (await grid.boundingBox())!;
  let bottom = gridBox.y;
  for (const card of await cards.all()) {
    const box = (await card.boundingBox())!;
    expect(box.width).toBeCloseTo(gridBox.width, 0);
    expect(box.y).toBeGreaterThanOrEqual(bottom);
    bottom = box.y + box.height;
  }
});

test('life confirms reading and preserves date navigation through browser history', async ({
  page,
}) => {
  await page.goto('/life/?d=2026-07-01');
  await page.bringToFront();
  await settleFrames(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/life\/\?d=2026-07-01$/);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          localStorage.getItem('thei:life:last-viewed-date:v1'),
        ),
      { timeout: 7000 },
    )
    .toBe('2026-07-01');
  await expect(
    page.locator('main[data-life-active-date="2026-07-01"]'),
  ).toBeVisible();
  // The whole date reads as one control, named by the date it shows; the
  // widest day and month names sit hidden under it to keep its width fixed.
  const bar = page.locator('[data-life-sticky-bar]');
  await expect(bar.getByRole('link')).toHaveAccessibleName('1 July 2026');
  await page.goto('/life/');
  await settleFrames(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const newestDate = await page
    .locator('main[data-life-newest-date]')
    .getAttribute('data-life-newest-date');
  expect(newestDate).toBeTruthy();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          localStorage.getItem('thei:life:last-viewed-date:v1'),
        ),
      { timeout: 7000 },
    )
    .toBe(newestDate);
});

test('Editor.js settles after structural operations and preserves semantic dirty state', async ({
  page,
}) => {
  let releaseSlowImage!: () => void;
  const slowImageGate = new Promise<void>((resolve) => {
    releaseSlowImage = resolve;
  });
  await page.route('**/slow-image.svg', async (route) => {
    await slowImageGate;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    });
  });
  await page.goto('/editor-regression');
  const state = page.locator('[data-ready]');
  await expect(state).toHaveAttribute('data-ready', 'true');
  const save = page.locator('[data-save]');
  releaseSlowImage();
  await expect(
    page.locator('[data-media-final-state="visible"]').first(),
  ).toBeVisible();
  await expect(state).toHaveAttribute('data-snapshot-pending', 'false');
  await expect(save).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
  const before = await state.getAttribute('data-events');
  await page.getByRole('button', { name: 'Refresh decoration' }).click();
  await settleFrames(page);
  await expect(state).toHaveAttribute('data-events', before!);
  await page.getByRole('button', { name: 'Invalid move', exact: true }).click();
  await expect
    .poll(async () => Number(await state.getAttribute('data-events')))
    .toBeGreaterThan(Number(before));
  await settleFrames(page);
  await expect(save).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
  await page.getByRole('button', { name: 'Insert section' }).click();
  await expect(page.locator('[data-private-section-id="new"]')).toHaveCount(2);
  // Empty sections are intentionally absent from the stored content format.
  await expect(save).toHaveText('Saved');
  await page.keyboard.insertText('New private content');
  await expect(save).toHaveText('Save');
  await save.click();
  await expect(state).toHaveAttribute('data-snapshot-pending', 'false');
  await expect(state).toHaveAttribute('data-transitions', '');
  await page.getByRole('button', { name: 'Delete section' }).click();
  await expect(page.locator('[data-private-section-id="new"]')).toHaveCount(0);
  await expect(save).toHaveText('Save');
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(state).toHaveAttribute('data-snapshot-pending', 'false');
  await save.click();
  await page.getByRole('button', { name: 'Valid move', exact: true }).click();
  await expect(save).toHaveText('Save');
  await save.click();
  await page
    .locator('[data-id="p1"] [contenteditable]')
    .fill('Changed inside section');
  await expect(save).toHaveText('Save');
});

/**
 * The boxes the lock pattern lies on, and whether each spans a non-empty
 * section from the line of its opening bracket to the line of its closing one.
 */
async function privatePattern(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.content-editor')!;
    const boxes = Array.from(
      root.querySelectorAll(':scope > .content-private-pattern'),
      (box) => box.getBoundingClientRect(),
    ).sort((left, right) => left.top - right.top);
    const sections: DOMRect[][] = [];
    const starts = root.querySelectorAll<HTMLElement>(
      '.ce-block[data-private-section-edge="start"]',
    );
    for (const start of starts) {
      const id = start.querySelector<HTMLElement>('[data-private-section-id]')!
        .dataset.privateSectionId;
      const end = root.querySelector(
        `.ce-block[data-private-section-edge="end"]:has([data-private-section-id="${id}"])`,
      );
      if (!end || start.nextElementSibling === end) continue;
      sections.push(
        [start, end].map((block) =>
          block
            .querySelector('[data-private-section-id]')!
            .getBoundingClientRect(),
        ),
      );
    }
    const aligned =
      boxes.length === sections.length &&
      sections.every(([start, end], index) => {
        const box = boxes[index]!;
        return [
          box.top - (start!.top + start!.height / 2),
          box.bottom - (end!.top + end!.height / 2),
          box.left - start!.left,
          box.width - start!.width,
        ].every((difference) => Math.abs(difference) < 0.5);
      });
    return { boxes: boxes.length, aligned };
  });
}

test('each private section in the editor lies on one lock pattern', async ({
  page,
}) => {
  await page.route('**/slow-image.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/editor-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect
    .poll(() => privatePattern(page))
    .toEqual({ boxes: 2, aligned: true });

  // A section grows with its blocks: as one is typed in, and as one moves in.
  const firstHeight = () =>
    page.evaluate(
      () =>
        Array.from(
          document.querySelectorAll(
            '.content-editor > .content-private-pattern',
          ),
          (box) => box.getBoundingClientRect(),
        ).sort((left, right) => left.top - right.top)[0]!.height,
    );
  let height = await firstHeight();
  await page
    .locator('[data-id="p1"] [contenteditable]')
    .fill('A paragraph long enough to wrap over several lines. '.repeat(12));
  await expect.poll(firstHeight).toBeGreaterThan(height + 50);
  await expect
    .poll(() => privatePattern(page))
    .toEqual({ boxes: 2, aligned: true });
  height = await firstHeight();
  await page.getByRole('button', { name: 'Valid move', exact: true }).click();
  await expect.poll(firstHeight).toBeGreaterThan(height);
  await expect
    .poll(() => privatePattern(page))
    .toEqual({ boxes: 2, aligned: true });

  // A new section gets a box of its own, and the ones below move down; back
  // up once it is gone. It goes after the current block, outside the others,
  // and in the same batch of changes as the move: the move stays.
  await page.locator('[data-id="p0"] [contenteditable]').click();
  await page.getByRole('button', { name: 'Insert section' }).click();
  await expect
    .poll(() => privatePattern(page))
    .toEqual({ boxes: 3, aligned: true });
  await expect(page.locator('[data-id="p2"]')).toHaveAttribute(
    'data-private-section-member',
    'true',
  );
  await page.getByRole('button', { name: 'Delete section' }).click();
  await expect
    .poll(() => privatePattern(page))
    .toEqual({ boxes: 2, aligned: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() => privatePattern(page))
    .toEqual({ boxes: 2, aligned: true });
});

/**
 * The text of the editor as its private sections read: `[id` and `]id` for
 * the edges (`?id` for one that pairs with nothing), the words of a paragraph
 * or a quote, `(empty)` for an empty one, the id of any other block, with `*`
 * before a block inside a section.
 */
async function sectionOutline(page: Page) {
  return page.locator('.content-editor .ce-block').evaluateAll((blocks) =>
    blocks.map((block) => {
      const item = block as HTMLElement;
      const bracket = item.querySelector<HTMLElement>(
        '[data-private-section-id]',
      );
      if (bracket) {
        const edge = item.dataset.privateSectionEdge;
        return `${edge === 'end' ? ']' : edge === 'start' ? '[' : '?'}${bracket.dataset.privateSectionId}`;
      }
      const text = item.querySelector('.ce-paragraph, .cdx-quote__text');
      const words = text ? text.textContent?.trim() || '(empty)' : undefined;
      return `${item.dataset.privateSectionMember ? '*' : ''}${words ?? item.dataset.id}`;
    }),
  );
}

/** The saved text, a line a block (`savedOutline` of the fixture). */
async function savedText(page: Page) {
  return JSON.parse(
    (await page.locator('[data-ready]').getAttribute('data-saved')) ?? '[]',
  ) as string[];
}

/** The section ids in an outline that are not `known`, renamed in order. */
function namedSections(outline: string[], known = ['one', 'two']) {
  const names = new Map<string, string>();
  return outline.map((line) =>
    line.replace(/^([[\]?])(.+)$/, (_, edge: string, id: string) => {
      if (known.includes(id)) return `${edge}${id}`;
      if (!names.has(id)) names.set(id, `copy${names.size + 1}`);
      return `${edge}${names.get(id)}`;
    }),
  );
}

const PRIVATE_FIXTURE_TAIL = ['media', 'gallery', 'divider', 'Quoted', 'After'];

async function openPrivateFixture(page: Page, query = '') {
  await page.route('**/slow-image.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    }),
  );
  await page.goto(`/editor-regression${query}`);
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-snapshot-pending',
    'false',
  );
  expect(await sectionOutline(page)).toEqual([
    'Before',
    '[one',
    '*Inside one',
    ']one',
    'Between',
    '[two',
    '*Inside two',
    ']two',
    ...PRIVATE_FIXTURE_TAIL,
  ]);
}

/** Puts the caret in a block's text, at its start or its end. */
async function caretIn(page: Page, id: string, at: 'start' | 'end') {
  const field = page.locator(`[data-id="${id}"] [contenteditable="true"]`);
  await field.click();
  await page.keyboard.press(at === 'start' ? 'Home' : 'End');
}

async function caretPlace(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const element =
      node instanceof Element ? node : (node?.parentElement ?? null);
    return {
      block: element?.closest<HTMLElement>('.ce-block')?.dataset.id,
      offset: selection?.anchorOffset ?? -1,
      selected: Array.from(
        document.querySelectorAll<HTMLElement>('.ce-block--selected'),
        (block) => block.dataset.id,
      ),
    };
  });
}

/**
 * A block dragged by its handle onto another, as the fixture's drag binding
 * takes it: the events a pointer drag fires, in their order.
 */
async function dragBlock(
  page: Page,
  sourceId: string,
  targetId: string,
  placement: 'before' | 'after',
) {
  // The handle stands beside the block the caret, or the focus, is in.
  const source = page.locator(`.ce-block[data-id="${sourceId}"]`);
  const field = source.locator('[contenteditable="true"]');
  await ((await field.count()) ? field.first() : source).click();
  await page.evaluate(
    ([targetId, placement]) => {
      const root = document.querySelector<HTMLElement>('.content-editor')!;
      const button = root.querySelector<HTMLElement>(
        '.ce-toolbar__settings-btn',
      )!;
      const target = root.querySelector<HTMLElement>(
        `.ce-block[data-id="${targetId}"]`,
      )!;
      const handle = button.getBoundingClientRect();
      button.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          button: 0,
          clientX: handle.x + 2,
          clientY: handle.y + 2,
        }),
      );
      const dataTransfer = new DataTransfer();
      button.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, dataTransfer }),
      );
      const box = target.getBoundingClientRect();
      const point = {
        clientX: box.x + 40,
        clientY: placement === 'before' ? box.y + 2 : box.bottom - 2,
      };
      for (const type of ['dragover', 'drop'])
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            ...point,
          }),
        );
      button.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, dataTransfer }),
      );
    },
    [targetId, placement] as const,
  );
}

/** Blocks pasted where the caret is, as Editor.js copies them. */
async function pasteBlocks(
  page: Page,
  blocks: Array<{ tool: string; data: object }>,
) {
  await page.evaluate((blocks) => {
    const selection = window.getSelection()!;
    const node = selection.anchorNode!;
    const element = node instanceof Element ? node : node.parentElement!;
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/x-editor-js', JSON.stringify(blocks));
    dataTransfer.setData('text/plain', 'pasted');
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      }),
    );
  }, blocks);
}

const copyOfSectionOne = [
  {
    tool: 'privateSectionBoundary',
    data: { sectionId: 'one', edge: 'start' },
  },
  { tool: 'paragraph', data: { text: 'Copied inside' } },
  { tool: 'privateSectionBoundary', data: { sectionId: 'one', edge: 'end' } },
];

test.describe('private sections in the editor', () => {
  let errors: string[] = [];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
  });
  test.afterEach(async ({ page }) => {
    expect(errors).toEqual([]);
    await expect(page.locator('[data-ready]')).toHaveAttribute(
      'data-save-errors',
      '',
    );
  });

  test('moving the only block of a section into another removes the empty one and keeps the rest private', async ({
    page,
  }) => {
    await openPrivateFixture(page, '?drag');
    const save = page.locator('[data-save]');

    // By its handle: "Inside one" dropped above "Inside two".
    await dragBlock(page, 'p1', 'p3', 'before');
    const moved = [
      'Before',
      'Between',
      '[two',
      '*Inside one',
      '*Inside two',
      ']two',
      ...PRIVATE_FIXTURE_TAIL,
    ];
    await expect.poll(() => sectionOutline(page)).toEqual(moved);
    await expect(save).toHaveText('Save');
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.locator('[data-ready]')).toHaveAttribute(
      'data-reopened',
      '1',
    );
    expect(await savedText(page)).toEqual([
      'Before',
      'Between',
      '[two',
      'Inside one',
      'Inside two',
      ']two',
      'contentMedia',
      'contentGallery',
      'delimiter',
      'quote',
      'After',
    ]);
    await expect.poll(() => sectionOutline(page)).toEqual(moved);
  });

  test('moving the only block of a section out by its menu removes the empty section at once', async ({
    page,
  }) => {
    await openPrivateFixture(page);
    // Editor.js's own "Move down", three times: out of the first section,
    // past "Between", and into the second.
    for (const outline of [
      ['Before', 'Inside one', 'Between', '[two', '*Inside two', ']two'],
      ['Before', 'Between', 'Inside one', '[two', '*Inside two', ']two'],
      ['Before', 'Between', '[two', '*Inside one', '*Inside two', ']two'],
    ]) {
      await page.locator('[data-id="p1"] [contenteditable="true"]').click();
      await page.locator('.ce-toolbar__settings-btn').click();
      await page
        .locator('.ce-popover-item[data-item-name="move-down"]')
        .click();
      await expect
        .poll(() => sectionOutline(page))
        .toEqual([...outline, ...PRIVATE_FIXTURE_TAIL]);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect
      .poll(() => sectionOutline(page))
      .toEqual([
        'Before',
        'Between',
        '[two',
        '*Inside one',
        '*Inside two',
        ']two',
        ...PRIVATE_FIXTURE_TAIL,
      ]);
  });

  test('an edge never crosses its partner, and its menu removes the section whole', async ({
    page,
  }) => {
    await openPrivateFixture(page, '?drag');
    // The end of the first section dragged above its start would wrap
    // "Before" and leave "Inside one" public: refused.
    await dragBlock(page, 'e1', 'p0', 'before');
    await page.waitForTimeout(500);
    expect((await sectionOutline(page)).slice(0, 4)).toEqual([
      'Before',
      '[one',
      '*Inside one',
      ']one',
    ]);

    // The edge's menu has one way out, which keeps the blocks.
    await page.locator('[data-id="s1"]').click();
    await page.locator('.ce-toolbar__settings-btn').click();
    const remove = page.locator(
      '.ce-popover-item[data-item-name="private-section-remove"]',
    );
    await expect(remove).toBeVisible();
    await expect(remove).toHaveText('Remove private section');
    await expect(
      page.locator('.ce-popover--opened [data-item-name="delete"]'),
    ).toBeHidden();
    await remove.click();
    await expect
      .poll(() => sectionOutline(page))
      .toEqual([
        'Before',
        'Inside one',
        'Between',
        '[two',
        '*Inside two',
        ']two',
        ...PRIVATE_FIXTURE_TAIL,
      ]);
    await expect(page.locator('[data-save]')).toHaveText('Save');
  });

  test('a pasted copy of a section becomes a section of its own, and goes inside another', async ({
    page,
  }) => {
    await openPrivateFixture(page);
    await caretIn(page, 'p4', 'end');
    await pasteBlocks(page, copyOfSectionOne);
    const pasted = [
      'Before',
      '[one',
      '*Inside one',
      ']one',
      'Between',
      '[two',
      '*Inside two',
      ']two',
      ...PRIVATE_FIXTURE_TAIL,
      '[copy1',
      '*Copied inside',
      ']copy1',
    ];
    await expect
      .poll(async () => namedSections(await sectionOutline(page)))
      .toEqual(pasted);
    // Nothing is left selected for the next key to replace.
    expect((await caretPlace(page)).selected).toEqual([]);

    // Its edge's menu takes its own partner, never the original's.
    const copyStart = page
      .locator('.content-editor .ce-block')
      .filter({ hasText: 'Start of private section' })
      .last();
    await copyStart.click();
    await page.locator('.ce-toolbar__settings-btn').click();
    await page
      .locator('.ce-popover-item[data-item-name="private-section-remove"]')
      .click();
    await expect
      .poll(() => sectionOutline(page))
      .toEqual([...pasted.slice(0, -3), 'Copied inside']);

    // Pasted inside the second section, the copy's edges go and its block
    // stays there, private.
    await caretIn(page, 'p3', 'end');
    await pasteBlocks(page, copyOfSectionOne);
    await expect
      .poll(async () => (await sectionOutline(page)).slice(4, 9))
      .toEqual(['Between', '[two', '*Inside two', '*Copied inside', ']two']);
    // An edge pasted alone goes.
    const edges = page.locator('.content-editor [data-private-section-id]');
    await expect(edges).toHaveCount(4);
    await caretIn(page, 'p0', 'end');
    await pasteBlocks(page, copyOfSectionOne.slice(0, 1));
    await expect(edges).toHaveCount(5);
    await expect(edges).toHaveCount(4);
    expect((await sectionOutline(page)).slice(0, 4)).toEqual([
      'Before',
      '[one',
      '*Inside one',
      ']one',
    ]);

    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.locator('[data-ready]')).toHaveAttribute(
      'data-reopened',
      '1',
    );
    expect((await savedText(page)).slice(0, 10)).toEqual([
      'Before',
      '[one',
      'Inside one',
      ']one',
      'Between',
      '[two',
      'Inside two',
      'Copied inside',
      ']two',
      'contentMedia',
    ]);
  });

  test('Backspace and Delete step over the edges of a section and never remove them', async ({
    page,
  }) => {
    await openPrivateFixture(page);
    // Twice at the start of a section's first block: the caret goes to the
    // end of the block before the section, then takes a letter there.
    await caretIn(page, 'p1', 'start');
    await page.keyboard.press('Backspace');
    expect(await caretPlace(page)).toEqual({
      block: 'p0',
      offset: 'Before'.length,
      selected: [],
    });
    await page.keyboard.press('Backspace');
    await expect
      .poll(() => sectionOutline(page))
      .toEqual([
        'Befor',
        '[one',
        '*Inside one',
        ']one',
        'Between',
        '[two',
        '*Inside two',
        ']two',
        ...PRIVATE_FIXTURE_TAIL,
      ]);

    // Delete at the end of the block before a section goes in past its start.
    await caretIn(page, 'p0', 'end');
    await page.keyboard.press('Delete');
    expect(await caretPlace(page)).toEqual({
      block: 'p1',
      offset: 0,
      selected: [],
    });

    // An empty first line of a section: Backspace leaves it, and the section.
    await caretIn(page, 'p3', 'start');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect
      .poll(async () => (await sectionOutline(page)).slice(4, 9))
      .toEqual(['Betwee', '[two', '*(empty)', '*Inside two', ']two']);

    // An edge the arrows selected takes no key: a letter or Backspace
    // leaves it in place.
    await caretIn(page, 'p1', 'start');
    await page.keyboard.press('ArrowUp');
    expect((await caretPlace(page)).selected).toEqual(['s1']);
    await page.keyboard.press('x');
    await page.keyboard.press('Backspace');
    expect(await caretPlace(page)).toMatchObject({
      block: 'p0',
      selected: [],
    });
    expect((await sectionOutline(page)).slice(0, 4)).toEqual([
      'Befor',
      '[one',
      '*Inside one',
      ']one',
    ]);
  });

  test('cutting across the edge of a section keeps the edge, and what stays private stays private', async ({
    page,
  }) => {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPrivateFixture(page);
    // A second line in the first section.
    await caretIn(page, 'p1', 'end');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Second inside');
    await expect
      .poll(async () => (await sectionOutline(page)).slice(0, 5))
      .toEqual(['Before', '[one', '*Inside one', '*Second inside', ']one']);

    // "Before", the start of the section and "Inside one", selected and cut.
    await caretIn(page, 'p0', 'end');
    // The first Shift+arrow selects the block and its neighbour.
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    expect((await caretPlace(page)).selected).toEqual(['p0', 's1', 'p1']);
    await page.keyboard.press('Control+X');
    await expect
      .poll(async () => (await sectionOutline(page)).slice(0, 4))
      .toEqual(['(empty)', '[one', '*Second inside', ']one']);

    // Pasted at the end, they are plain blocks there: the cut took no edge.
    await caretIn(page, 'p4', 'end');
    await page.keyboard.press('Control+V');
    await expect
      .poll(async () => (await sectionOutline(page)).slice(-3))
      .toEqual(['After', 'Before', 'Inside one']);

    // The same across the end of a section. Backspace over the selection,
    // with the caret Shift and the arrows leave at the start of "Between",
    // removes nothing at all, and the end stays.
    await caretIn(page, 'p2', 'start');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    expect((await caretPlace(page)).selected).toEqual([
      expect.any(String),
      'e1',
      'p2',
    ]);
    await page.keyboard.press('Backspace');
    // Past Editor.js's batch of changes, nothing has gone.
    await page.waitForTimeout(500);
    expect((await sectionOutline(page)).slice(0, 5)).toEqual([
      '(empty)',
      '[one',
      '*Second inside',
      ']one',
      'Between',
    ]);
    await caretIn(page, 'p2', 'start');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Control+X');
    await expect
      .poll(async () => (await sectionOutline(page)).slice(0, 5))
      .toEqual(['(empty)', '[one', '*(empty)', ']one', '[two']);

    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.locator('[data-ready]')).toHaveAttribute(
      'data-reopened',
      '1',
    );
    expect(await savedText(page)).toEqual([
      '[two',
      'Inside two',
      ']two',
      'contentMedia',
      'contentGallery',
      'delimiter',
      'quote',
      'After',
      'Before',
      'Inside one',
    ]);
  });
});

test('a click beside a paragraph places the caret at the start or end of that line', async ({
  page,
}) => {
  await page.route('**/slow-image.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    }),
  );
  await page.goto('/editor-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const caret = () =>
    page.evaluate(() => {
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const paragraph =
        node instanceof Element ? node : (node?.parentElement ?? null);
      return {
        offset: selection?.anchorOffset ?? -1,
        block: paragraph?.closest('.ce-block')?.getAttribute('data-id'),
      };
    });
  const field = page.locator('[data-id="p0"] [contenteditable]');
  const holder = page.locator('.content-editor');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const box = (await field.boundingBox())!;
    const edge = (await holder.boundingBox())!.x;
    const middle = box.y + box.height / 2;
    // The margin left of the text column, inside the editor.
    await page.mouse.click(edge + 4, middle);
    expect(await caret()).toEqual({ offset: 0, block: 'p0' });
    await page.mouse.click(box.x + box.width + 4, middle);
    expect(await caret()).toEqual({ offset: 'Before'.length, block: 'p0' });
  }
  // Hovering opens the toolbar beside the block; it must not cover the text.
  await page.setViewportSize({ width: 1280, height: 844 });
  const box = (await field.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  // The toolbar box itself has no height; its buttons are what shows.
  await expect(page.locator('.ce-toolbar__actions--opened')).toBeVisible();
  const under = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x!, y!)?.closest('[contenteditable]')
        ? 'text'
        : 'other',
    [box.x + 1, box.y + box.height / 2],
  );
  expect(under).toBe('text');
});

test('an address pasted over selected text links that text instead of replacing it', async ({
  page,
}) => {
  await page.goto('/editor-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const field = page.locator('[data-id="p0"] [contenteditable]');
  // A double click takes the space after a word along with it; the link
  // takes only the word.
  await field.evaluate((element) => {
    element.textContent = 'Before tail';
  });
  const paste = (text: string) =>
    field.evaluate((element, value) => {
      const node = element.firstChild!;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 'Before '.length);
      (element as HTMLElement).focus();
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      const data = new DataTransfer();
      data.setData('text/plain', value);
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, text);

  await paste(' https://example.org/page ');
  const link = field.locator('a');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('Before');
  await expect(link).toHaveAttribute('data-content-link', 'external');
  await expect(link).toHaveAttribute('href', 'https://example.org/page');
  await expect(field).toHaveText('Before tail');

  // An address of this very site becomes a link to what it opens, and
  // keeps the place inside it the address leads to.
  await page.route('**/api/admin/content-entities/by-url**', (route) =>
    route.fulfill({
      json: {
        entity: {
          entityType: 'event',
          entityId: 'e-encore',
          title: 'Concert',
          summary: '',
          url: '/events/concert-Encore1/',
          humanReadableSlug: 'concert',
          publicId: 'Encore1',
          updatedAt: 1,
        },
      },
    }),
  );
  const origin = new URL(page.url()).origin;
  await field.evaluate((element) => {
    element.textContent = 'Before tail';
  });
  await paste(`${origin}/events/concert-Encore1/#second-set`);
  await expect(link).toHaveAttribute('data-content-link', 'entity');
  await expect(link).toHaveAttribute('data-entity-id', 'e-encore');
  await expect(link).toHaveAttribute('data-entity-fragment', 'second-set');
  await expect(link).toHaveAttribute('href', /#second-set$/);
  await expect(field).toHaveText('Before tail');
});

test('links pasted with rich text are links at once, and saved as they are shown', async ({
  page,
}) => {
  await page.goto('/editor-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.route('**/api/admin/content-entities/by-url**', (route) =>
    route.fulfill({
      json: {
        entity: {
          entityType: 'event',
          entityId: 'e-encore',
          title: 'Concert',
          summary: '',
          url: '/events/concert-Encore1/',
          humanReadableSlug: 'concert',
          publicId: 'Encore1',
          updatedAt: 1,
        },
      },
    }),
  );
  const origin = new URL(page.url()).origin;
  const field = page.locator('[data-id="p0"] [contenteditable]');
  await field.click();
  const html =
    '<meta charset="utf-8"><p>See <a href="https://example.org/one">one</a>, ' +
    '<a href="https://example.org/two?x=1">two</a>, ' +
    `<a href="${origin}/events/concert-Encore1/#second-set">the concert</a> ` +
    'and <a href="/about/">about</a>. </p>';
  await field.evaluate((element, value) => {
    (element as HTMLElement).focus();
    getSelection()!.collapse(element, 0);
    const data = new DataTransfer();
    data.setData('text/html', value);
    data.setData('text/plain', 'See one, two, the concert and about. ');
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, html);

  // Every web address is a link of the editor's own as soon as it lands,
  // however many came at once; one of this site names what it opens.
  const one = field.locator('a', { hasText: 'one' });
  const two = field.locator('a', { hasText: 'two' });
  const concert = field.locator('a', { hasText: 'the concert' });
  await expect(one).toHaveAttribute('data-content-link', 'external');
  await expect(one).toHaveAttribute('href', 'https://example.org/one');
  await expect(two).toHaveAttribute('data-content-link', 'external');
  await expect(concert).toHaveAttribute('data-content-link', 'entity');
  await expect(concert).toHaveAttribute('data-entity-id', 'e-encore');
  await expect(concert).toHaveAttribute('data-entity-fragment', 'second-set');
  // A relative address stays the plain link storage keeps it as.
  const about = field.locator('a', { hasText: 'about' });
  await expect(about).toHaveAttribute('href', '/about/');
  await expect(about).not.toHaveAttribute('data-content-link', /./);
  await expect(field).toContainText('See one, two, the concert and about.');

  // Saved, the text stays saved: making the links changed nothing after.
  // Editor.js reports changes in batches of 400 ms.
  const bar = page.locator('[data-transitions]');
  await page.waitForTimeout(600);
  await expect(bar).toHaveAttribute('data-snapshot-pending', 'false');
  await page.locator('[data-save]').click();
  await expect(page.locator('[data-save]')).toHaveText('Saved');
  await page.waitForTimeout(1000);
  await expect(bar).toHaveAttribute('data-transitions', '');
  await expect(page.locator('[data-save]')).toHaveText('Saved');
});

test('life cache evicts distant windows, preserves focus and reloads both directions', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    const targets = new Set<Set<Element>>();
    const Observer = window.ResizeObserver;
    window.ResizeObserver = class extends Observer {
      observed = new Set<Element>();
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        targets.add(this.observed);
      }
      observe(element: Element, options?: ResizeObserverOptions) {
        this.observed.add(element);
        super.observe(element, options);
      }
      unobserve(element: Element) {
        this.observed.delete(element);
        super.unobserve(element);
      }
      disconnect() {
        this.observed.clear();
        super.disconnect();
      }
    };
    (window as any).detachedLifeMeasurements = () =>
      [...targets]
        .flatMap((items) => [...items])
        .filter(
          (element) =>
            element.hasAttribute('data-life-key') && !element.isConnected,
        ).length;
  });
  const errors: string[] = [];
  const windowRequests = new Map<string, number>();
  page.on('request', (request) => {
    if (!request.url().includes('/api/life?cursor=')) return;
    windowRequests.set(
      request.url(),
      (windowRequests.get(request.url()) ?? 0) + 1,
    );
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/life/?d=2026-07-01');
  const cache = page.locator('[data-life-cached-windows]');
  await expect(cache).toBeVisible();
  const focused = page.locator('[data-life-key] a').first();
  await focused.focus();
  const focusKey = await page.evaluate(
    () =>
      document.activeElement?.closest<HTMLElement>('[data-life-key]')?.dataset
        .lifeKey,
  );
  expect(focusKey).toBeTruthy();
  for (let index = 0; index < 14; index++) {
    const before = Number(await cache.getAttribute('data-life-windows'));
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect
      .poll(async () => Number(await cache.getAttribute('data-life-windows')))
      .toBeGreaterThan(before);
    expect(
      Number(await cache.getAttribute('data-life-cached-windows')),
    ).toBeLessThanOrEqual(10);
    expect(await page.locator('[data-life-key]').count()).toBeLessThan(80);
  }
  expect(
    await page.evaluate(
      () =>
        document.activeElement?.closest<HTMLElement>('[data-life-key]')?.dataset
          .lifeKey,
    ),
  ).toBe(focusKey);
  await expect
    .poll(() => page.evaluate(() => (window as any).detachedLifeMeasurements()))
    .toBe(0);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, document.documentElement.scrollHeight * 0.2);
  });
  await expect
    .poll(() => [...windowRequests.values()].some((count) => count > 1))
    .toBe(true);
  for (let index = 0; index < 6; index++) {
    await page.evaluate(() => window.scrollBy(0, -window.innerHeight * 12));
    await settleFrames(page);
    expect(
      Number(await cache.getAttribute('data-life-cached-windows')),
    ).toBeLessThanOrEqual(10);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.locator('[data-life-key] .life-item').first(),
  ).toBeAttached();
  expect(errors).toEqual([]);
});

test('a failed life window offers retry and keeps the cursor', async ({
  page,
}) => {
  await page.goto('/life/?d=2026-07-01');
  await expect(page.locator('[data-life-cached-windows]')).toBeVisible();
  const attempts: string[] = [];
  await page.route('**/api/life?**', async (route) => {
    if (!route.request().url().includes('cursor=')) return route.continue();
    attempts.push(route.request().url());
    if (attempts.length === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"statusCode":503,"message":"Temporary failure"}',
      });
    else await route.continue();
  });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(attempts.length).toBeGreaterThanOrEqual(2);
  expect(attempts[1]).toBe(attempts[0]);
});

test('SSR hydrates once, keeps missing resources as 404 and filters private content on the server', async ({
  page,
}) => {
  const warnings: string[] = [];
  const repeated: string[] = [];
  page.on('console', (message) => {
    if (/hydration/i.test(message.text())) warnings.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/pages/page-0'))
      repeated.push(request.url());
  });
  expect((await page.goto('/pages/page-0/'))!.status()).toBe(200);
  await expect(
    page.locator('h2').filter({ hasText: 'Public heading' }),
  ).toBeVisible();
  await expect(
    page.locator('h2').filter({ hasText: 'Private heading' }),
  ).toHaveCount(0);
  await expect(
    page.locator('h3').filter({ hasText: 'Section heading' }),
  ).toHaveCount(0);
  await waitForNuxtHydration(page);
  expect(repeated).toEqual([]);
  expect(warnings).toEqual([]);
  expect((await page.goto('/tags/not-found/'))!.status()).toBe(404);
  expect((await page.goto('/pages/not-found/'))!.status()).toBe(404);
});

test('the admin gate holds against an encoded request path', async ({
  request,
}) => {
  // h3 routes on the decoded path while `node.req.url` stays raw, so an
  // access check written against the raw target would miss these.
  for (const path of [
    '/api/admin/settings',
    '/api/%61dmin/settings',
    '/%61pi/admin/settings',
    '/api/admin/%73ettings',
    '/%61dmin/',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(403);
  }
  // The encoded path really does reach a handler — a public one answers it.
  expect((await request.get('/%61pi/search')).status()).toBe(200);
});

test('public lists reuse SSR data and a client API failure remains an API error', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      ['/api/life/latest', '/api/pages', '/api/search', '/api/tags'].includes(
        path,
      )
    )
      requests.push(path);
  });
  for (const path of ['/', '/pages/', '/search/', '/tags/']) {
    await page.goto(path);
    await waitForNuxtHydration(page);
  }
  expect(requests).toEqual([]);
  await page.route('**/api/pages*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"statusCode":503,"message":"Temporary failure"}',
    }),
  );
  await page
    .getByRole('navigation', { name: 'Site navigation' })
    .getByRole('link', { name: 'Pages', exact: true })
    .click();
  await expect(page.getByText('503', { exact: true })).toBeVisible();
});

test.describe('administrator content and keyboard panels', () => {
  test.use({ storageState: adminState });
  test('creates and saves pages, projects, sections and events on the fresh schema', async ({
    request,
    browserName,
  }) => {
    const content = {
      data: {
        blocks: [{ type: 'paragraph', data: { text: 'Persisted body' } }],
      },
    };
    const pageData = {
      title: 'Created page',
      summary: 'Summary',
      slug: `crud-${browserName}`,
      access: 'public',
      content,
    };
    const createdPage = await (
      await request.post('/api/admin/pages', { data: pageData })
    ).json();
    expect(createdPage.type, JSON.stringify(createdPage)).toBe('success');
    // Every save names the version it was read at, as the forms do.
    const versionOf = async (path: string) =>
      (await (await request.get(path)).json()).version as number;
    expect(
      await (
        await request.put(`/api/admin/pages/${createdPage.pageUuid}`, {
          data: {
            ...pageData,
            title: 'Saved page',
            version: await versionOf(
              `/api/admin/pages/${createdPage.pageUuid}`,
            ),
          },
        })
      ).json(),
    ).toMatchObject({ type: 'success' });
    expect(
      await (await request.get(`/api/pages/${pageData.slug}`)).json(),
    ).toMatchObject({ title: 'Saved page' });
    const child = {
      title: 'Child',
      summary: 'Summary',
      humanReadableSlug: 'child',
      isPrivate: false,
      content,
    };
    const projectData = {
      title: 'Created project',
      summary: 'Summary',
      access: 'public',
      humanReadableSlug: 'project',
      publicId: `project${browserName}`,
      showcase: false,
      cv: false,
      descriptionContent: content,
      sections: [
        { ...child, publicId: `section${browserName}`, periods: [] },
        {
          title: 'Only dates',
          summary: '',
          humanReadableSlug: 'dates',
          isPrivate: false,
          publicId: `dated${browserName}`,
          periods: [{ startDate: '2026-01-01', endDate: '2026-01-02' }],
        },
      ],
    };
    const createdProject = await (
      await request.post('/api/admin/projects', { data: projectData })
    ).json();
    expect(createdProject.type, JSON.stringify(createdProject)).toBe('success');
    const storedProject = await (
      await request.get(`/api/admin/projects/${createdProject.projectUuid}`)
    ).json();
    expect(storedProject.sections).toHaveLength(2);
    expect(storedProject.sections[1].periods).toHaveLength(1);
    expect(
      await (
        await request.put(`/api/admin/projects/${createdProject.projectUuid}`, {
          data: {
            ...projectData,
            sections: storedProject.sections,
            title: 'Saved project',
            version: storedProject.version,
          },
        })
      ).json(),
    ).toMatchObject({ type: 'success' });
    const eventData = {
      title: 'Created event',
      summary: 'Summary',
      access: 'public',
      humanReadableSlug: 'event',
      publicId: `event${browserName}`,
      content,
      periods: [{ startDate: '2026-02-01', endDate: '2026-02-02' }],
    };
    const createdEvent = await (
      await request.post('/api/admin/events', { data: eventData })
    ).json();
    expect(createdEvent.type, JSON.stringify(createdEvent)).toBe('success');
    expect(
      await (
        await request.put(`/api/admin/events/${createdEvent.eventUuid}`, {
          data: {
            ...eventData,
            title: 'Saved event',
            version: await versionOf(
              `/api/admin/events/${createdEvent.eventUuid}`,
            ),
          },
        })
      ).json(),
    ).toMatchObject({ type: 'success' });
  });
  test('renders private headings and native collapsible panels', async ({
    page,
  }) => {
    await page.goto('/pages/page-0/');
    await expect(
      page.locator('h2').filter({ hasText: 'Private heading' }),
    ).toBeVisible();
    await expect(
      page.locator('h3').filter({ hasText: 'Section heading' }),
    ).toBeVisible();
    await expect(page.locator('a[href="#private-heading"]')).toBeVisible();
    const details = page
      .locator('details')
      .filter({ has: page.locator('a[href="#private-heading"]') })
      .first();
    const summary = details.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open');
    await expect
      .poll(() =>
        details.evaluate(
          (element) =>
            getComputedStyle(element, '::details-content').contentVisibility,
        ),
      )
      .toBe('hidden');
    await page.keyboard.press('Tab');
    expect(
      await details
        .locator('a')
        .evaluateAll((elements) =>
          elements.some((element) => element === document.activeElement),
        ),
    ).toBe(false);
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(details).toHaveAttribute('open');
  });
});

test('dense life day remains virtualized and restores date navigation', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (/hydration/i.test(message.text())) warnings.push(message.text());
  });
  await page.goto('/life/');
  await expect(page.locator('[data-life-key]').first()).toBeVisible();
  await waitForNuxtHydration(page);
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  for (let index = 0; index < 12; index++) {
    await page.evaluate(() => window.scrollBy(0, 1800));
    await settleFrames(page);
  }
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  await page.setViewportSize({ width: 580, height: 850 });
  await settleFrames(page);
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  await page.goto('/life/?d=2026-05-01');
  await expect(page.locator('[data-life-sticky-bar]')).toBeVisible();
  await waitForNuxtHydration(page);
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  expect(
    Number(
      await page
        .locator('[data-life-cached-windows]')
        .getAttribute('data-life-cached-windows'),
    ),
  ).toBeLessThanOrEqual(10);
  expect(warnings).toEqual([]);
});
