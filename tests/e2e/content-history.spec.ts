import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

/**
 * A page of its own for each test, with a saved text: the seeded pages carry
 * no text, and a page without one cannot be edited.
 */
async function createPage(page: Page, name: string) {
  const slug = `history-${name}-${Date.now()}`;
  const response = await page.request.post('/api/admin/pages', {
    data: {
      title: `History ${name}`,
      summary: 'A page for the content history spec.',
      slug,
      access: 'public',
      content: {
        data: {
          blocks: [
            {
              type: 'paragraph',
              data: { text: 'The saved text of the page.' },
            },
          ],
        },
      },
      reminder: '',
      notes: null,
    },
  });
  const result = await response.json();
  expect(result.type, JSON.stringify(result)).toBe('success');
  return result.pageUuid as string;
}

async function openPageEditor(page: Page, url: string) {
  await page.goto(url);
  // The field answers clicks once the page is hydrated.
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-field]').first().click();
  // The editor and Editor.js load on first use; the first editable block is
  // there once it is ready.
  await expect(
    page.locator('dialog .content-editor [contenteditable="true"]').first(),
  ).toBeVisible({ timeout: 15_000 });
}

async function typeInEditor(page: Page, text: string) {
  await page
    .locator('dialog .content-editor [contenteditable="true"]')
    .last()
    .click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

/** The draft has reached the server: the header says so by its icon. */
async function waitForDraft(page: Page) {
  await expect(page.locator('[data-history-status]')).toBeVisible({
    timeout: 15_000,
  });
}

async function editorText(page: Page) {
  return page.locator('dialog .content-editor').innerText();
}

/** Nothing sticks out of the screen, and the page never scrolls sideways. */
async function expectFitsScreen(page: Page, ...locators: Locator[]) {
  const viewport = page.viewportSize()!;
  for (const locator of locators) {
    const box = await locator.boundingBox();
    expect(box, 'element is on screen').not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(
      await locator.evaluate((root) => root.scrollWidth - root.clientWidth),
      'no horizontal overflow inside',
    ).toBeLessThanOrEqual(1);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

/** The text compared with another version, on the review screen. */
const reviewScreen = (page: Page) => page.locator('[data-review]');

/** Takes all of what the version has, and the editor gets it. */
async function takeAll(page: Page) {
  // Nothing taken yet, the finish takes all; then it takes it in.
  const finish = page.locator('[data-review-finish]');
  await expect(finish).toHaveText(/^Take all · /);
  await finish.click();
  await expect(finish).toHaveText(/^Take · /);
  await finish.click();
  await expect(reviewScreen(page)).toBeHidden();
}

test('text of a page never created is offered again, compared before it is taken', async ({
  context,
  page,
}) => {
  const marker = `Written before the power went out ${Date.now()}`;
  await openPageEditor(page, '/admin/pages/new/');
  await typeInEditor(page, marker);
  await waitForDraft(page);

  // Another window, as after a crash: the text is on the server.
  const again = await context.newPage();
  await again.setViewportSize(DESKTOP);
  await again.goto('/admin/pages/new/');
  await again.waitForLoadState('networkidle');
  await expect(
    again.locator('[data-field-unsaved-draft]').first(),
  ).toBeVisible();
  await again.locator('button[data-field]').first().click();
  const notice = again.locator('[data-editor-notice="draft"]');
  await expect(notice).toBeVisible({ timeout: 15_000 });

  // Taking it up is a comparison first: the text shows what would come.
  await again.locator('[data-draft-offer-open]').click();
  const screen = reviewScreen(again);
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute('data-review-mode', 'version');
  await expect(screen.locator('[data-review-block]').first()).toContainText(
    marker,
  );
  await expect(again.locator('dialog .content-editor')).toBeHidden();
  await expectFitsScreen(again, screen);

  await again.setViewportSize(MOBILE);
  await expectFitsScreen(again, screen);
  const header = await screen.locator('header').boundingBox();
  expect(header!.height).toBeLessThan(160);
  await again.setViewportSize(DESKTOP);

  await takeAll(again);
  expect(await editorText(again)).toContain(marker);
  await expect(notice).toBeHidden();
  await expect(again.locator('[data-restore-undo]')).toBeVisible();
});

test('a text closed without saving is kept as a version and comes back', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const marker = `Unsaved thought ${Date.now()}`;
  const pageUuid = await createPage(page, 'discarded');
  await openPageEditor(page, `/admin/pages/${pageUuid}/edit/`);
  await typeInEditor(page, marker);
  await waitForDraft(page);

  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog .content-editor')).toBeHidden();

  // Nothing is offered: closing was a decision. The text is in the history,
  // which says why it kept it.
  await page.locator('button[data-field]').first().click();
  await expect(page.locator('dialog .content-editor')).toBeVisible();
  await expect(page.locator('[data-editor-notice="draft"]')).toBeHidden();
  await page.getByRole('button', { name: 'Version history' }).click();
  const list = page.locator('[data-content-history-panel]');
  await expect(list).toBeVisible();
  await expectFitsScreen(page, list);
  const row = list.locator('[data-history-row="version"]').first();
  await expect(row).toContainText('Closed without saving');
  await row.click();
  await expect(reviewScreen(page)).toContainText('Closed without saving');

  // Escape leaves the comparison; the editor is untouched meanwhile.
  await page.keyboard.press('Escape');
  await expect(reviewScreen(page)).toBeHidden();
  await expect(page.locator('dialog .content-editor')).toBeVisible();
  expect(await editorText(page)).not.toContain(marker);

  await page.getByRole('button', { name: 'Version history' }).click();
  await row.click();
  await takeAll(page);
  expect(await editorText(page)).toContain(marker);
});

test('the text as opened comes first once it differs, and brings it back', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const marker = `Typed after opening ${Date.now()}`;
  const pageUuid = await createPage(page, 'opened');
  await openPageEditor(page, `/admin/pages/${pageUuid}/edit/`);
  await typeInEditor(page, marker);
  await waitForDraft(page);

  await page.getByRole('button', { name: 'Version history' }).click();
  const list = page.locator('[data-content-history-panel]');
  await expect(list.locator('[data-history-row]').first()).toHaveAttribute(
    'data-history-row',
    'opened',
  );
  // The history is only versions: nothing in it empties the text.
  await expect(list.getByRole('button', { name: /clear/i })).toHaveCount(0);
  await list.locator('[data-history-row="opened"]').click();
  await expect(reviewScreen(page)).toContainText('The saved text of the page.');
  await takeAll(page);
  expect(await editorText(page)).not.toContain(marker);
});

test('without a connection the text waits in the browser and is sent when it returns', async ({
  context,
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const marker = `Typed offline ${Date.now()}`;
  const pageUuid = await createPage(page, 'offline');
  await openPageEditor(page, `/admin/pages/${pageUuid}/edit/`);
  await context.setOffline(true);
  await typeInEditor(page, marker);
  const notice = page.locator('[data-editor-notice="offline"]');
  await expect(notice).toContainText('Offline', { timeout: 15_000 });
  const buffered = () =>
    page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith('thei:content-unsynced:'),
      ),
    );
  expect(await buffered()).toHaveLength(1);

  await context.setOffline(false);
  await expect(notice).toBeHidden({ timeout: 15_000 });
  await expect.poll(buffered).toHaveLength(0);
  const history = await page.request.get(
    `/api/admin/content-history?ownerType=page&ownerRef=${pageUuid}&slot=page-body`,
  );
  expect((await history.json()).drafts).toHaveLength(1);
});

test('a draft written in one tab is offered in another as it grows', async ({
  context,
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const pageUuid = await createPage(page, 'two-tabs');
  const url = `/admin/pages/${pageUuid}/edit/`;
  await openPageEditor(page, url);
  const other = await context.newPage();
  await other.setViewportSize(DESKTOP);
  await openPageEditor(other, url);
  const notice = other.locator('[data-editor-notice="draft"]');
  await expect(notice).toBeHidden();

  // The first tab writes; the other offers it without being touched.
  await typeInEditor(page, ` First tab ${Date.now()}`);
  await expect(notice).toBeVisible({ timeout: 15_000 });
  const firstSeen = await notice.getAttribute('data-draft-offer');

  // It goes on writing, and the offer follows.
  const more = `and goes on ${Date.now()}`;
  await typeInEditor(page, ` ${more}`);
  await expect(notice).not.toHaveAttribute('data-draft-offer', firstSeen!, {
    timeout: 15_000,
  });
  await other.locator('[data-draft-offer-open]').click();
  await expect(reviewScreen(other)).toContainText(more);

  // Neither tab wrote over the other: each keeps a draft of its own.
  await other.locator('[data-review-close]').click();
  await typeInEditor(other, ' Second tab');
  await expect
    .poll(
      async () => {
        const history = await page.request.get(
          `/api/admin/content-history?ownerType=page&ownerRef=${pageUuid}&slot=page-body`,
        );
        return (await history.json()).drafts.length;
      },
      { timeout: 15_000 },
    )
    .toBe(2);
});

test('a text saved elsewhere while this one is written is offered to compare', async ({
  context,
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const pageUuid = await createPage(page, 'saved-elsewhere');
  const url = `/admin/pages/${pageUuid}/edit/`;
  await openPageEditor(page, url);
  await typeInEditor(page, ` Written here ${Date.now()}`);
  await waitForDraft(page);

  // Another device saves the text meanwhile.
  const there = `Saved there ${Date.now()}`;
  const other = await context.newPage();
  await other.setViewportSize(DESKTOP);
  await openPageEditor(other, url);
  await typeInEditor(other, ` ${there}`);
  await other.locator('[data-editor-save]').click();
  await expect(other.locator('[data-editor-save]')).toHaveText('Saved');
  await other.close();

  // Writing on here, the editor hears of it with its next draft.
  await typeInEditor(page, ' and more');
  const notice = page.locator('[data-editor-notice="stored"]');
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-stored-compare]').click();
  await expect(reviewScreen(page)).toContainText(there);
  await takeAll(page);
  expect(await editorText(page)).toContain(there);
  await expect(notice).toBeHidden();
});

/**
 * Records every notice of the editor and every draft note of a field that
 * shows up, for however short a time: a flash is over before an assertion
 * could look.
 */
async function recordNotices(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __notices: string[] }).__notices = seen;
    const look = () => {
      for (const element of document.querySelectorAll(
        '[data-editor-notice], [data-field-unsaved-draft]',
      )) {
        const name =
          element.getAttribute('data-editor-notice') ?? 'field-draft';
        if (!seen.includes(name)) seen.push(name);
      }
    };
    new MutationObserver(look).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    look();
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __notices: string[] }).__notices,
    );
}

test('saving and closing at once flashes no draft and no notice', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const pageUuid = await createPage(page, 'no-flash');
  await openPageEditor(page, `/admin/pages/${pageUuid}/edit/`);
  const seen = await recordNotices(page);
  const save = page.locator('[data-editor-save]');

  // A draft on the server, then more typed and saved before the pause
  // after typing would send it: the draft there is older than the save.
  await typeInEditor(page, ` Kept as a draft ${Date.now()}`);
  await waitForDraft(page);
  await typeInEditor(page, ' and saved at once');
  await expect(save).toHaveText('Save');
  await save.click();
  await expect(save).toHaveText('Saved');
  // Saved again in the same sitting, the text saved first now the server's.
  await typeInEditor(page, ' and again');
  await expect(save).toHaveText('Save');
  await save.click();
  await expect(save).toHaveText('Saved');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog .content-editor')).toBeHidden();
  // The field looks again once the editor has gone: long enough to see it.
  await page.waitForTimeout(1500);
  expect(await seen()).toEqual([]);
});

test('a form with unsaved changes asks before the tab closes', async ({
  page,
}) => {
  await page.goto('/admin/diary/new/');
  await page.waitForLoadState('networkidle');
  // The reminder is a plain field of the form, outside any editor.
  await page.locator('textarea').first().fill('Remember this');
  let asked = false;
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'beforeunload') asked = true;
    await dialog.accept();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked).toBe(true);
});
