import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Ctrl+Z in the editor is the browser's own: it undoes what the browser and
 * Thei's own editing commands did, step by step, and never leaves a text
 * half undone — a dragged piece twice, a link's words gone, a dash undone
 * into the wrong place. Where a step is beyond it, Ctrl+Z does nothing.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openEditor(page: Page, name: string, blocks: object[]) {
  const slug = `undo-${name}-${Date.now()}`;
  const response = await page.request.post('/api/admin/pages', {
    data: {
      title: `Undo ${name}`,
      summary: 'A page for the undo spec.',
      slug,
      // Kept out of the public lists other specs read.
      access: 'private',
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

const fields = (page: Page) =>
  page.locator('dialog .content-editor .ce-block [contenteditable="true"]');

/** Selects the first occurrence of `text` in a field. */
async function select(field: Locator, text: string) {
  await field.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf(wanted);
      if (at < 0) continue;
      (element as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    throw new Error(`No «${wanted}» in the field`);
  }, text);
}

/** Where the caret would stand before the first `text` in a field. */
async function pointBefore(field: Locator, text: string) {
  return await field.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf(wanted);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + rect.height / 2 };
    }
    throw new Error(`No «${wanted}» in the field`);
  }, text);
}

/** Drags the current selection with the real pointer to a point. */
async function dragSelectionTo(page: Page, to: { x: number; y: number }) {
  const from = await page.evaluate(() => {
    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

const undo = (page: Page) => page.keyboard.press('ControlOrMeta+z');
const redo = (page: Page) => page.keyboard.press('ControlOrMeta+Shift+z');

/**
 * Starts listing what the save button says each time it changes, so a test
 * can tell an edit that only flickered the state from a real one.
 */
async function watchSaveButton(page: Page) {
  await page.evaluate(() => {
    const button = document.querySelector('[data-editor-save]')!;
    const said: string[] = [];
    (window as unknown as { saveSaid: string[] }).saveSaid = said;
    new MutationObserver(() => {
      const text = button.textContent!.trim();
      if (said.at(-1) !== text) said.push(text);
    }).observe(button, { childList: true, subtree: true, characterData: true });
  });
}
const saveSaid = (page: Page) =>
  page.evaluate(() => (window as unknown as { saveSaid: string[] }).saveSaid);

/** Drops data from outside the page at a point, as a browser delivers it. */
async function dropFromOutside(
  page: Page,
  to: { x: number; y: number },
  data: Record<string, string>,
) {
  await page.evaluate(
    ({ to, data }) => {
      const transfer = new DataTransfer();
      for (const [type, value] of Object.entries(data))
        transfer.setData(type, value);
      const target = document.elementFromPoint(to.x, to.y)!;
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: to.x,
        clientY: to.y,
        dataTransfer: transfer,
      };
      target.dispatchEvent(new DragEvent('dragenter', init));
      target.dispatchEvent(new DragEvent('dragover', init));
      target.dispatchEvent(new DragEvent('drop', init));
    },
    { to, data },
  );
}

/** Pastes clipboard data into the focused field, as the browser delivers it. */
async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((data) => {
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(data))
      transfer.setData(type, value);
    document.activeElement!.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  }, data);
}

/** Puts the caret right after the first `text` in a field. */
async function caretAfter(field: Locator, text: string) {
  await field.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf(wanted);
      if (at < 0) continue;
      (element as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(node, at + wanted.length);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    throw new Error(`No «${wanted}» in the field`);
  }, text);
}

/** The words of every field, a no-break space read as a space. */
const texts = (page: Page) =>
  fields(page).evaluateAll((items) =>
    items.map((item) => (item.textContent ?? '').replace(/\s/g, ' ')),
  );

test.describe('dragging text', () => {
  test('a piece dragged within its paragraph moves once and comes back once', async ({
    page,
  }) => {
    await openEditor(page, 'drag-within', [
      { type: 'paragraph', data: { text: 'one two three four' } },
      { type: 'paragraph', data: { text: 'The end' } },
    ]);
    const field = fields(page).first();
    await select(field, 'two ');
    await dragSelectionTo(page, await pointBefore(field, 'four'));
    await expect(field).toHaveText('one three two four');

    await undo(page);
    await expect(field).toHaveText('one two three four');
    await redo(page);
    await expect(field).toHaveText('one three two four');
    await expect(fields(page).nth(1)).toHaveText('The end');
  });

  test('bold words dragged within a paragraph stay bold, and nothing is styled', async ({
    page,
  }) => {
    await openEditor(page, 'drag-bold', [
      { type: 'paragraph', data: { text: 'one <b>two</b> three four' } },
    ]);
    const field = fields(page).first();
    await select(field, 'two');
    await dragSelectionTo(page, await pointBefore(field, 'four'));
    await expect(field.locator('b')).toHaveText('two');
    expect((await texts(page))[0].replace(/ +/g, ' ')).toBe(
      'one three twofour',
    );
    await expect(field.locator('[style]')).toHaveCount(0);
    await undo(page);
    await expect
      .poll(async () => (await texts(page))[0])
      .toBe('one two three four');
  });

  test('a piece dragged into another paragraph moves, and two undos bring it back', async ({
    page,
  }) => {
    await openEditor(page, 'drag-across', [
      { type: 'paragraph', data: { text: 'alpha beta gamma' } },
      { type: 'paragraph', data: { text: 'one two' } },
    ]);
    await select(fields(page).first(), ' beta');
    await dragSelectionTo(page, await pointBefore(fields(page).nth(1), ' two'));
    await expect
      .poll(() => texts(page))
      .toEqual(['alpha gamma', 'one beta two']);

    await undo(page);
    await undo(page);
    await expect
      .poll(() => texts(page))
      .toEqual(['alpha beta gamma', 'one two']);
    await redo(page);
    await redo(page);
    await expect
      .poll(() => texts(page))
      .toEqual(['alpha gamma', 'one beta two']);
  });

  test('words dragged into a heading arrive as plain words', async ({
    page,
  }) => {
    await openEditor(page, 'drag-heading', [
      { type: 'header', data: { text: 'Title here', level: 2 } },
      { type: 'paragraph', data: { text: 'some <b>bold</b> words' } },
    ]);
    const heading = fields(page).first();
    await select(fields(page).nth(1), 'bold');
    await dragSelectionTo(page, await pointBefore(heading, 'here'));
    await expect(heading).toHaveText('Title boldhere');
    await expect(heading.locator('*')).toHaveCount(0);
    expect((await texts(page))[1]).toBe('some  words');
  });

  test('a link pressed and moved drags nothing', async ({ page }) => {
    await openEditor(page, 'drag-link', [
      {
        type: 'paragraph',
        data: {
          text: 'see <a href="https://example.com/" data-content-link="external">this site</a> now',
        },
      },
    ]);
    const field = fields(page).first();
    const box = (await field.locator('a').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.move(box.x + box.width + 30, box.y + box.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await expect(field).toHaveText('see this site now');
    await expect(field.locator('a')).toHaveCount(1);
  });

  test('rich text dropped from outside lands cleaned at the drop point', async ({
    page,
  }) => {
    await openEditor(page, 'drop-outside', [
      { type: 'paragraph', data: { text: 'left right' } },
    ]);
    const field = fields(page).first();
    await dropFromOutside(page, await pointBefore(field, 'right'), {
      'text/html':
        '<p style="color: red">Hi <b>there</b><script>alert(1)</script><img src="x"> </p>',
      'text/plain': 'Hi there ',
    });
    await expect(field.locator('b')).toHaveText('there');
    await expect
      .poll(async () => (await texts(page))[0])
      .toBe('left Hi there right');
    await expect(field.locator('[style], img, script')).toHaveCount(0);
    await undo(page);
    await expect.poll(async () => (await texts(page))[0]).toBe('left right');
  });
});

test.describe('pasting', () => {
  test('one copied paragraph goes in at the caret, and one undo takes it out', async ({
    page,
  }) => {
    await openEditor(page, 'paste-one', [
      { type: 'paragraph', data: { text: 'start end' } },
      { type: 'paragraph', data: { text: 'The end' } },
    ]);
    const field = fields(page).first();
    await caretAfter(field, 'start ');
    await paste(page, {
      'text/html': '<p style="font-size: 30px">a <i>pasted</i> line</p>',
      'text/plain': 'a pasted line',
    });
    await expect(field.locator('i')).toHaveText('pasted');
    await expect
      .poll(async () => (await texts(page))[0])
      .toBe('start a pasted lineend');
    await expect(field.locator('[style]')).toHaveCount(0);
    await expect(fields(page)).toHaveCount(2);
    await undo(page);
    await expect.poll(async () => (await texts(page))[0]).toBe('start end');
    await redo(page);
    await expect
      .poll(async () => (await texts(page))[0])
      .toBe('start a pasted lineend');
  });

  test('a paste the moment the editor shows is still one undo step', async ({
    page,
  }) => {
    // Editor.js binds its blocks' keys at the first idle moment after it
    // shows them, and the paste and undo handlers come after that; on a busy
    // page that moment comes late. The text shows once they are all bound.
    await page.addInitScript(() => {
      const idle = window.requestIdleCallback.bind(window);
      window.requestIdleCallback = ((callback, options) =>
        window.setTimeout(() => idle(callback, options), 500)) as typeof idle;
    });
    await openEditor(page, 'paste-early', [
      { type: 'paragraph', data: { text: 'start end' } },
    ]);
    const field = fields(page).first();
    await caretAfter(field, 'start ');
    await paste(page, {
      'text/html': '<p>a <i>pasted</i> line</p>',
      'text/plain': 'a pasted line',
    });
    await expect
      .poll(async () => (await texts(page))[0])
      .toBe('start a pasted lineend');
    await undo(page);
    await expect.poll(async () => (await texts(page))[0]).toBe('start end');
  });

  test('a copied paragraph pasted into a heading is plain words', async ({
    page,
  }) => {
    await openEditor(page, 'paste-heading', [
      { type: 'header', data: { text: 'Title', level: 2 } },
    ]);
    const heading = fields(page).first();
    await caretAfter(heading, 'Title');
    await paste(page, {
      'text/html': '<p>and <b>more</b></p>',
      'text/plain': 'and more',
    });
    await expect(heading).toHaveText('Titleand more');
    await expect(heading.locator('*')).toHaveCount(0);
    await expect(fields(page)).toHaveCount(1);
  });

  test('several paragraphs still become blocks', async ({ page }) => {
    await openEditor(page, 'paste-many', [
      { type: 'paragraph', data: { text: 'Seed' } },
    ]);
    await fields(page).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(fields(page)).toHaveCount(2);
    await paste(page, {
      'text/html': '<p>first</p><p>second</p>',
      'text/plain': 'first\nsecond',
    });
    await expect(fields(page)).toHaveCount(3);
    await expect(fields(page).nth(2)).toHaveText('second');
  });

  test('an address pasted over words makes a link, which one undo takes off', async ({
    page,
  }) => {
    await page.route('**/api/admin/external-links**', (route) =>
      route.fulfill({ json: null }),
    );
    await openEditor(page, 'paste-link', [
      { type: 'paragraph', data: { text: 'read the docs today' } },
    ]);
    const field = fields(page).first();
    await select(field, 'the docs');
    await paste(page, { 'text/plain': 'https://example.com/docs' });
    await expect(field.locator('a')).toHaveText('the docs');
    await undo(page);
    await expect(field.locator('a')).toHaveCount(0);
    await expect
      .poll(async () => (await texts(page))[0])
      .toBe('read the docs today');
    await redo(page);
    await expect(field.locator('a')).toHaveText('the docs');
  });
});

test.describe('typing', () => {
  test('a dash typed and undone leaves the text whole', async ({ page }) => {
    await openEditor(page, 'dash', [
      { type: 'paragraph', data: { text: 'Seed' } },
    ]);
    await caretAfter(fields(page).first(), 'Seed');
    await page.keyboard.type(' a -- b');
    await expect.poll(async () => (await texts(page))[0]).toBe('Seed a — b');
    // Undone a step at a time, the words pass only through what was typed
    // on the way — the set dash goes back to the one typed as a step of its
    // own — until the undo meets a step it cannot be sure of and stops;
    // nothing is ever doubled or broken on the way.
    const passed = ['Seed a — b'];
    for (let step = 0; step < 10; step++) {
      await undo(page);
      passed.push((await texts(page))[0]!);
    }
    expect(passed).toContain('Seed a --');
    for (const text of passed)
      expect(
        'Seed a — b'.startsWith(text) || 'Seed a --'.startsWith(text),
        `"${text}" is no state the words went through`,
      ).toBe(true);
    for (let step = 0; step < 10; step++) await redo(page);
    await expect.poll(async () => (await texts(page))[0]).toBe('Seed a — b');
  });

  test('Enter in the middle of typed words is not undone into a mess', async ({
    page,
  }) => {
    await openEditor(page, 'enter', [
      { type: 'paragraph', data: { text: 'Seed' } },
    ]);
    await fields(page).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' hello world');
    for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(fields(page)).toHaveCount(2);
    const split = await texts(page);
    expect(split.map((text) => text.trim())).toEqual(['Seed hello', 'world']);
    // The split is no step of the words: undo stops before it.
    await undo(page);
    await expect.poll(() => texts(page)).toEqual(split);
    await undo(page);
    await expect.poll(() => texts(page)).toEqual(split);
    await redo(page);
    await expect.poll(() => texts(page)).toEqual(split);

    // Typing after the split is undone alone.
    await page.keyboard.type('X');
    await undo(page);
    await expect.poll(() => texts(page)).toEqual(split);
  });

  test('a slash is only a slash, and Ctrl+/ still opens the settings', async ({
    page,
  }) => {
    await openEditor(page, 'slash', [
      { type: 'paragraph', data: { text: 'Seed' } },
    ]);
    await fields(page).first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Control+Slash');
    await expect(
      page.locator('.ce-popover--opened .ce-popover-item').first(),
    ).toBeVisible();
    // A click in the text closes them.
    await fields(page).first().click();
    await expect(page.locator('.ce-popover--opened')).toHaveCount(0);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(fields(page)).toHaveCount(2);
    await page.keyboard.type('/');
    await expect(fields(page).nth(1)).toHaveText('/');
    await expect(page.locator('.ce-popover--opened')).toHaveCount(0);
  });

  test('the save state never flickers over a drag and its undo', async ({
    page,
  }) => {
    await openEditor(page, 'save-state', [
      { type: 'paragraph', data: { text: 'one two three four' } },
    ]);
    await watchSaveButton(page);
    const field = fields(page).first();
    await select(field, 'two ');
    await dragSelectionTo(page, await pointBefore(field, 'four'));
    await expect(field).toHaveText('one three two four');
    await expect.poll(() => saveSaid(page)).toEqual(['Save']);
    await undo(page);
    await expect(field).toHaveText('one two three four');
    await expect.poll(() => saveSaid(page)).toEqual(['Save', 'Saved']);
  });
});
