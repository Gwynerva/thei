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

test('text of a page never created is offered again, with its changes shown before restoring', async ({
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
  const chip = again.locator('[data-draft-offer]');
  await expect(chip).toBeVisible({ timeout: 15_000 });

  // Taking it up is a question first: the text shows what would come.
  await again.locator('[data-draft-offer-open]').click();
  const bar = again.locator('[data-restore-bar]');
  await expect(bar).toBeVisible();
  await expect(again.locator('[data-diff="added"]')).toContainText(marker);
  await expect(again.locator('dialog .content-editor')).toBeHidden();
  await expectFitsScreen(again, bar, again.locator('dialog header'));

  await again.setViewportSize(MOBILE);
  await expectFitsScreen(again, bar, again.locator('dialog header'));
  const header = await again.locator('dialog header').boundingBox();
  expect(header!.height).toBeLessThan(160);
  await again.setViewportSize(DESKTOP);

  await again.locator('[data-restore-confirm]').click();
  await expect(bar).toBeHidden();
  expect(await editorText(again)).toContain(marker);
  await expect(chip).toBeHidden();
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

  // Nothing is offered: closing was a decision. The text is in the history.
  await page.locator('button[data-field]').first().click();
  await expect(page.locator('dialog .content-editor')).toBeVisible();
  await expect(page.locator('[data-draft-offer]')).toBeHidden();
  await page.getByRole('button', { name: 'Version history' }).click();
  const list = page.locator('[data-content-history-panel]');
  await expect(list).toBeVisible();
  await expectFitsScreen(page, list);
  // The newest version; why it was kept is told once it is chosen.
  const row = list.locator('[data-history-row="version"]').first();
  await row.click();
  await expect(page.locator('[data-restore-bar]')).toContainText(
    'Closed without saving',
  );

  // Back returns to the list; the editor is untouched meanwhile.
  await page.keyboard.press('Escape');
  await expect(list).toBeVisible();
  await expect(page.locator('[data-restore-bar]')).toBeHidden();
  await expect(page.locator('dialog .content-editor')).toBeVisible();
  expect(await editorText(page)).not.toContain(marker);

  await row.click();
  await page.locator('[data-restore-confirm]').click();
  await expect(page.locator('[data-restore-bar]')).toBeHidden();
  expect(await editorText(page)).toContain(marker);
});

test('clearing keeps what the editor held', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const marker = `About to be cleared ${Date.now()}`;
  const pageUuid = await createPage(page, 'cleared');
  await openPageEditor(page, `/admin/pages/${pageUuid}/edit/`);
  await typeInEditor(page, marker);
  await waitForDraft(page);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('dialog .content-editor')).not.toContainText(
    marker,
  );

  await page.getByRole('button', { name: 'Version history' }).click();
  // The text differs from the one opened now, so that comes first.
  await expect(page.locator('[data-history-row]').first()).toHaveAttribute(
    'data-history-row',
    'opened',
  );
  await page.locator('[data-history-row="version"]').first().click();
  await expect(page.locator('[data-restore-bar]')).toContainText(
    'Before clearing',
  );
  await expect(page.locator('[data-diff="added"]')).toContainText(marker);
  await page.locator('[data-restore-confirm]').click();
  expect(await editorText(page)).toContain(marker);
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
  await expect(page.locator('[data-history-status]')).toContainText('Offline', {
    timeout: 15_000,
  });
  const buffered = () =>
    page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith('thei:content-unsynced:'),
      ),
    );
  expect(await buffered()).toHaveLength(1);

  await context.setOffline(false);
  await expect(page.locator('[data-history-status]')).not.toContainText(
    'Offline',
    { timeout: 15_000 },
  );
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
  const chip = other.locator('[data-draft-offer]');
  await expect(chip).toBeHidden();

  // The first tab writes; the other offers it without being touched.
  await typeInEditor(page, ` First tab ${Date.now()}`);
  await expect(chip).toBeVisible({ timeout: 15_000 });
  const firstSeen = await chip.getAttribute('data-draft-offer');

  // It goes on writing, and the offer follows.
  const more = `and goes on ${Date.now()}`;
  await typeInEditor(page, ` ${more}`);
  await expect(chip).not.toHaveAttribute('data-draft-offer', firstSeen!, {
    timeout: 15_000,
  });
  await other.locator('[data-draft-offer-open]').click();
  await expect(
    other.locator('[data-diff-words="added"]').first(),
  ).toContainText(more);

  // Neither tab wrote over the other: each keeps a draft of its own.
  await other.locator('[data-restore-back]').click();
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
