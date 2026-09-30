import { expect, test, type Page, type Route } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

/** A photo-like picture, the same bytes on every run. */
async function photo(width: number, height: number) {
  let seed = width * height;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
  const noise = Buffer.alloc(width * height * 3);
  for (let index = 0; index < noise.length; index += 3) {
    const x = (index / 3) % width;
    noise[index] = (x * 255) / width + random() * 40;
    noise[index + 1] = 120 + random() * 60;
    noise[index + 2] = 200 - random() * 60;
  }
  return await sharp(noise, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>';

function countRequests(page: Page) {
  const counts = { stage: 0, commit: 0, direct: 0 };
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path === '/api/admin/assets/drafts') counts.stage++;
    else if (/\/drafts\/[^/]+\/commit$/.test(path)) counts.commit++;
    else if (path === '/api/admin/assets') counts.direct++;
  });
  return counts;
}

const blocks = (page: Page) => page.locator('.content-editor .ce-block');
const figures = (page: Page) => page.locator('.content-editor figure');
const status = (page: Page) => page.locator('[data-content-asset-status]');

async function openFixture(page: Page) {
  await page.goto('/editor-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
}

/** A fresh empty paragraph at the end of the text, with the caret in it. */
async function emptyParagraph(page: Page) {
  const last = blocks(page).last();
  await last.scrollIntoViewIfNeeded();
  await last.locator('[contenteditable="true"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(
    blocks(page).last().locator('[contenteditable="true"]'),
  ).toHaveText('');
}

/** Pastes files into whatever has the focus. */
async function paste(
  page: Page,
  files: { name: string; type: string; base64: string }[],
) {
  await page.evaluate((files) => {
    const data = new DataTransfer();
    for (const file of files) {
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      data.items.add(new File([bytes], file.name, { type: file.type }));
    }
    document.activeElement!.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, files);
}

const png = async (name = 'shot.png') => ({
  name,
  type: 'image/png',
  base64: (await photo(640, 480)).toString('base64'),
});

test('a pasted picture is stored at medium, whole, at its own size, with progress on the way', async ({
  page,
  request,
}) => {
  await openFixture(page);
  const counts = countRequests(page);
  const before = await figures(page).count();
  await emptyParagraph(page);
  const committed = page.waitForResponse((response) =>
    /\/drafts\/[^/]+\/commit$/.test(new URL(response.url()).pathname),
  );
  await paste(page, [await png()]);

  // The block says where the file is, and nothing is dirty while it is
  // on its way: the text holds no picture yet.
  await expect(status(page)).toBeVisible();
  await expect(status(page)).not.toHaveText('');
  await expect(page.locator('[data-pending-uploads]')).toHaveAttribute(
    'data-pending-uploads',
    '1',
  );
  expect(
    await page.locator('[data-transitions]').getAttribute('data-transitions'),
  ).toBe('');

  const stored = (await (await committed).json()) as {
    assetUuid: string;
    extension: string;
  };
  await expect(figures(page)).toHaveCount(before + 1, { timeout: 30_000 });
  await expect(page.locator('[data-pending-uploads]')).toHaveAttribute(
    'data-pending-uploads',
    '0',
  );
  await expect(page.locator('[data-transitions]')).toHaveAttribute(
    'data-transitions',
    'Save',
  );
  await expect(
    figures(page).last().locator('[data-content-media-size]'),
  ).toBeVisible();
  expect(
    await page
      .locator('[data-upload-errors]')
      .getAttribute('data-upload-errors'),
  ).toBe('');

  // Once up and once committed: the medium picture, with the file as it
  // came kept beside it, unused, until the cleanup takes it.
  expect(counts).toEqual({ stage: 1, commit: 1, direct: 0 });
  expect(stored.extension).toBe('avif');
  const usages = await request.get(
    `/api/admin/assets/${stored.assetUuid}/usages`,
  );
  const { asset } = await usages.json();
  expect(asset.settings).toMatchObject({
    type: 'image-transform',
    quality: 75,
    dimensions: { width: 640, height: 480 },
  });
  expect(asset.settings.crop).toBeUndefined();
  const family = await request.get(
    `/api/admin/assets/${stored.assetUuid}/variants`,
  );
  const { variants } = (await family.json()) as {
    variants: {
      isUnprocessed: boolean;
      extension: string;
      usageCount: number;
      deleteAfter?: number;
    }[];
  };
  const original = variants.find((variant) => variant.isUnprocessed);
  expect(original).toMatchObject({ extension: 'png', usageCount: 0 });
  expect(original?.deleteAfter).toBeGreaterThan(Date.now());
});

test('the editor opened on a pasted picture makes new variants from the kept original', async ({
  page,
}) => {
  await openFixture(page);
  await emptyParagraph(page);
  const committed = page.waitForResponse((response) =>
    /\/drafts\/[^/]+\/commit$/.test(new URL(response.url()).pathname),
  );
  await paste(page, [await png()]);
  const stored = (await (await committed).json()) as { assetUuid: string };

  // Picked from the library, the stored picture opens in the asset editor.
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator('[data-pick]').click();
  await page.getByRole('button', { name: 'Reuse', exact: true }).click();
  const tile = page.locator(`[data-asset-uuid="${stored.assetUuid}"]`).first();
  const unused = page
    .locator('[data-asset-library-section]')
    .filter({ hasText: 'Unused' });
  await expect(unused).toBeVisible();
  if (!(await tile.isVisible())) await unused.click();
  await tile.click();

  // The original is listed, marked as going unless something uses it.
  const dialog = page.locator('dialog[open]').last();
  const kept = dialog.getByRole('button', { name: /^png 640×480 / });
  await expect(kept).toHaveCount(1, { timeout: 20_000 });
  await expect(kept.locator('[data-asset-pending-deletion]')).toBeVisible();

  // A new variant starts from it, not from the compressed picture.
  await dialog
    .getByRole('button', { name: 'Create variant', exact: true })
    .first()
    .click();
  const source = dialog
    .locator('select')
    .filter({ has: page.locator('option', { hasText: 'Unprocessed' }) });
  await expect(source.locator('option:checked')).toHaveText(
    /PNG.*Unprocessed/,
  );
  await expect(
    dialog.getByText('This source is already compressed', { exact: false }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('the editor opens on the pasted file while it is being stored, and the block goes on when it is dismissed', async ({
  page,
}) => {
  await openFixture(page);
  const counts = countRequests(page);
  const before = await figures(page).count();
  let hold = true;
  const held: Route[] = [];
  await page.route('**/api/admin/assets/drafts/*/commit', async (route) => {
    if (hold) held.push(route);
    else await route.continue();
  });
  await emptyParagraph(page);
  await paste(page, [await png()]);

  const edit = page.locator('[data-content-asset-edit]');
  await expect(edit).toBeVisible();
  await expect.poll(() => held.length).toBe(1);
  await edit.click();

  // The editor took the draft over: the file did not go up again, and the
  // default has been given up.
  const dialog = page.locator('dialog[open]');
  const useResult = dialog.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 20_000 });
  expect(counts.stage).toBe(1);
  await expect(dialog.getByRole('slider', { name: 'Quality' })).toHaveAttribute(
    'aria-valuetext',
    'Medium',
  );

  hold = false;
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Dismissed: the block stores the default after all.
  await expect(figures(page)).toHaveCount(before + 1, { timeout: 30_000 });
  expect(counts.commit).toBe(2);
  for (const route of held) await route.abort().catch(() => {});
});

test('what the editor settles on lands in the block', async ({ page }) => {
  await openFixture(page);
  const counts = countRequests(page);
  const before = await figures(page).count();
  const held: Route[] = [];
  let hold = true;
  await page.route('**/api/admin/assets/drafts/*/commit', async (route) => {
    if (hold) held.push(route);
    else await route.continue();
  });
  await emptyParagraph(page);
  await paste(page, [await png()]);
  await expect.poll(() => held.length).toBe(1);
  await page.locator('[data-content-asset-edit]').click();

  const dialog = page.locator('dialog[open]');
  const bar = dialog.getByRole('slider', { name: 'Quality' });
  await bar.focus();
  await page.keyboard.press('Home');
  await expect(bar).toHaveAttribute('aria-valuetext', 'Minimal');
  const useResult = dialog.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 20_000 });
  hold = false;
  await useResult.click();

  await expect(dialog).toHaveCount(0);
  await expect(figures(page)).toHaveCount(before + 1, { timeout: 30_000 });
  await expect(page.locator('[data-transitions]')).toHaveAttribute(
    'data-transitions',
    'Save',
  );
  expect(counts.stage).toBe(1);
  expect(counts.direct).toBe(0);
  for (const route of held) await route.abort().catch(() => {});
});

test('a pasted vector is kept as it is', async ({ page }) => {
  await openFixture(page);
  const before = await figures(page).count();
  await emptyParagraph(page);
  const committed = page.waitForResponse((response) =>
    /\/drafts\/[^/]+\/commit$/.test(new URL(response.url()).pathname),
  );
  await paste(page, [
    {
      name: 'drawing.svg',
      type: 'image/svg+xml',
      base64: Buffer.from(SVG).toString('base64'),
    },
  ]);
  const stored = (await (await committed).json()) as {
    extension: string;
    settings: { type: string };
  };
  await expect(figures(page)).toHaveCount(before + 1, { timeout: 30_000 });
  expect(stored.extension).toBe('svg');
  expect(stored.settings.type).toBe('original');
});

test('several pasted pictures become one gallery', async ({ page }) => {
  await openFixture(page);
  const galleries = page.locator('[data-content-gallery]');
  const before = await galleries.count();
  // Held until both tiles are seen: a small picture is stored too fast.
  let hold = true;
  const held: Route[] = [];
  await page.route('**/api/admin/assets/drafts/*/commit', async (route) => {
    if (hold) held.push(route);
    else await route.continue();
  });
  await emptyParagraph(page);
  await paste(page, [await png('one.png'), await png('two.png')]);

  // Each file is a tile of its own while on its way, and a picture after.
  await expect(galleries).toHaveCount(before + 1);
  const gallery = galleries.last();
  await expect(gallery.locator('[data-pending-upload]')).toHaveCount(2);
  await expect.poll(() => held.length).toBe(2);
  hold = false;
  for (const route of held.splice(0)) await route.continue();
  await expect(gallery.locator('[data-drag-id]')).toHaveCount(2, {
    timeout: 60_000,
  });
  await expect(gallery.locator('[data-pending-upload]')).toHaveCount(0);
  expect(
    await page
      .locator('[data-upload-errors]')
      .getAttribute('data-upload-errors'),
  ).toBe('');
});
