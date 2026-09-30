import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Route,
} from '@playwright/test';
import { E2E_ORIGIN } from './fixture-url';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createOriginalAssetSettings } from '../../shared/asset-upload-settings';
import { buildUploadHeaders } from '../../shared/api/asset-upload-headers';
import { screenshot } from './screenshots';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
async function upload(api: APIRequestContext, color = '#4368a2') {
  const buffer = await sharp({
    create: { width: 80, height: 60, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  // The file is the raw body; its metadata rides in headers so the server can
  // stream it to disk instead of buffering the whole request.
  const response = await api.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension: 'png',
    }),
    data: buffer,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return { asset: await response.json(), buffer };
}

async function uploadVideo(api: APIRequestContext) {
  const buffer = await readFile(
    fileURLToPath(
      new URL('./fixture/media/regression-video.mp4', import.meta.url),
    ),
  );
  const response = await api.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension: 'mp4',
    }),
    data: buffer,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function library(page: Page, batch = false) {
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator(batch ? '[data-batch]' : '[data-pick]').click();
  await page.getByRole('button', { name: 'Reuse', exact: true }).click();
}
/**
 * Picks a freshly uploaded asset. Nothing a file was called is kept, so an
 * unused upload is found in the unused section, where the newest come first.
 */
async function choose(page: Page, assetUuid: string) {
  const assetButton = page.locator(`[data-asset-uuid="${assetUuid}"]`).first();
  const unused = page
    .locator('[data-asset-library-section]')
    .filter({ hasText: 'Unused' });
  if (!(await assetButton.isVisible())) await unused.click();
  await expect(assetButton).toBeVisible();
  await assetButton.click();
  await expect(
    page.getByRole('button', { name: 'Processing source', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Saved variants', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create variant', exact: true }),
  ).toBeVisible();
  const variantButtons = page.getByRole('button', {
    name: 'Choose this variant',
    exact: true,
  });
  await expect(variantButtons.last()).toBeVisible();
  for (let index = 0; index < (await variantButtons.count()); index += 1) {
    const button = variantButtons.nth(index);
    if (await button.isEnabled()) {
      await button.click();
      return;
    }
  }
  throw new Error('No usable asset variant button was rendered');
}

/** A picture nothing else has uploaded: the bytes differ on every run. */
async function freshPicture(name: string) {
  const buffer = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: `#${randomUUID().slice(0, 6)}`,
    },
  })
    .png()
    .toBuffer();
  return { name, mimeType: 'image/png', buffer };
}

test('a batch of new files goes up with a tile each; one is given up, one is tried again', async ({
  page,
}) => {
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  // Every upload is held until the test lets it through.
  const held: Route[] = [];
  let hold = true;
  await page.route('**/api/admin/assets', async (route) => {
    if (route.request().method() !== 'POST' || !hold) {
      await route.continue();
      return;
    }
    held.push(route);
  });

  await page.locator('[data-batch]').click();
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await freshPicture('one.png'),
      await freshPicture('two.png'),
    ]);
  const tiles = page.locator('[data-pending-upload]');
  await expect(tiles).toHaveCount(2);
  await expect(page.locator('[data-pending]')).toHaveAttribute(
    'data-pending',
    '2',
  );
  await expect(tiles.first().getByRole('status')).not.toHaveText('');
  await expect.poll(() => held.length).toBe(2);
  // The picker is gone: the page is the admin's again while files go up.
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  // One is given up: its tile goes.
  await tiles.first().locator('[data-pending-cancel]').click();
  await expect(tiles).toHaveCount(1);
  // The other fails on the way: the tile stays, says so, and offers another
  // try, which lands it.
  await held[1]!.abort('failed').catch(() => {});
  await expect(tiles.first()).toHaveAttribute('data-pending-phase', 'failed');
  hold = false;
  await tiles.first().locator('[data-pending-retry]').click();
  await expect(tiles).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('[data-pending]')).toHaveAttribute(
    'data-pending',
    '0',
  );
  const results = JSON.parse(
    (await page.locator('[data-result]').textContent())!,
  ) as { assetUuid: string }[];
  expect(results).toHaveLength(1);
});

test('hash lookup reuses stored bytes without multipart upload, including renamed files', async ({
  page,
  request,
}) => {
  const { asset, buffer } = await upload(request, '#5a3d21');
  const lookup = await request.post('/api/admin/assets/lookup', {
    data: {
      hash: createHash('sha256').update(buffer).digest('hex'),
      extension: 'png',
      size: buffer.length,
    },
  });
  expect((await lookup.json()).asset.assetUuid).toBe(asset.assetUuid);
  let uploads = 0;
  page.on('request', (req) => {
    if (
      req.method() === 'POST' &&
      new URL(req.url()).pathname === '/api/admin/assets'
    )
      uploads++;
  });
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator('[data-pick]').click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'renamed.png', mimeType: 'image/png', buffer });
  await expect(
    page.getByText('This file has already been uploaded', { exact: true }),
  ).toBeVisible();
  const variantButtons = page.getByRole('button', {
    name: 'Choose this variant',
    exact: true,
  });
  await expect(variantButtons.last()).toBeVisible();
  for (let index = 0; index < (await variantButtons.count()); index += 1) {
    const button = variantButtons.nth(index);
    if (await button.isEnabled()) {
      await button.click();
      break;
    }
  }
  await expect(page.locator('[data-result]')).toContainText(asset.assetUuid);
  expect(uploads).toBe(0);
});

for (const width of [1280, 390]) {
  test(`single and batch library selection and admin details at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const first = await upload(request, width === 1280 ? '#763a55' : '#7d405b');
    const second = await upload(
      request,
      width === 1280 ? '#1c5362' : '#245b69',
    );
    expect(JSON.stringify([first.asset, second.asset])).not.toContain('.png"');
    await page.goto('/asset-regression');
    await expect(page.locator('[data-ready]')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await page.locator('[data-constrained]').click();
    await expect(
      page.getByRole('button', { name: 'Upload', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reuse', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await library(page);
    await choose(page, first.asset.assetUuid);
    await expect(page.locator('[data-result]')).toContainText(
      first.asset.assetUuid,
    );
    await library(page, true);
    await choose(page, first.asset.assetUuid);
    await choose(page, second.asset.assetUuid);
    await page.getByRole('button', { name: 'Insert selected · 2' }).click();
    await expect(page.locator('[data-result]')).toContainText(
      second.asset.assetUuid,
    );
    const chosen = JSON.parse(await page.locator('[data-result]').innerText());
    expect(chosen.map((a: any) => a.assetUuid)).toEqual([
      first.asset.assetUuid,
      second.asset.assetUuid,
    ]);

    const created = await request.post('/api/admin/pages', {
      data: {
        title: 'Library usage test',
        summary: 'Искомое описание',
        slug: `library-${randomUUID()}`,
        access: 'public',
        iconAssetUuid: first.asset.assetUuid,
        content: {
          data: {
            blocks: [
              {
                id: 'media',
                type: 'contentMedia',
                data: {
                  layout: 'centered',
                  asset: { assetUuid: first.asset.assetUuid },
                },
              },
            ],
          },
        },
      },
    });
    const saved = await created.json();
    expect(saved.type, JSON.stringify(saved)).toBe('success');
    const usages = await (
      await request.get(`/api/admin/assets/${first.asset.assetUuid}/usages`)
    ).json();
    const thisPage = usages.placements.filter(
      (p: any) => p.source.id === saved.pageUuid,
    );
    expect(thisPage.map((p: any) => p.role).sort()).toEqual([
      'content',
      'icon',
    ]);

    await page.goto('/admin/assets/');
    await expect(page.locator('[data-admin-assets-ready]')).toHaveAttribute(
      'data-admin-assets-ready',
      'true',
    );
    // Found by where it is used: the page that holds it.
    await page.getByRole('searchbox').fill('Library usage test');
    // The search lands in the address after a pause; a modal opened before
    // that would go with the route change.
    await expect(page).toHaveURL(/[?&]q=/);
    const assetRow = page.locator(
      `[data-asset-uuid="${first.asset.assetUuid}"]`,
    );
    await expect(assetRow).toBeVisible();
    await assetRow.click();
    await expect(page.getByRole('heading', { name: 'Used in' })).toBeVisible();
    await expect(
      page.getByText('Library usage test', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Page content', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View entity', exact: true }).first(),
    ).toHaveAttribute('target', '_blank');
    await expect(
      page.getByRole('link', { name: 'Edit entity' }).first(),
    ).toHaveAttribute('target', '_blank');
    expect(
      await page
        .locator('body')
        .evaluate((el) => el.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(page, `library-details-${width}`);
    await page.keyboard.press('Escape');
    await library(page);
    await page.getByRole('searchbox').fill('ИСКОМОЕ');
    await expect(
      page.getByText('Library usage test', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.locator(`[data-asset-uuid="${first.asset.assetUuid}"]`).first(),
    ).toBeVisible();
    await screenshot(page, `library-${width}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-result]')).toHaveText('[]');
  });
}

test('library endpoints require admin access', async ({ playwright }) => {
  const api = await playwright.request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: { cookies: [], origins: [] },
  });
  for (const path of [
    '/api/admin/assets',
    '/api/admin/assets/library',
    '/api/admin/assets/availability',
    '/api/admin/assets/library/unused/all',
    '/api/admin/assets/missing/usages',
  ]) {
    const response = await api.get(path);
    expect(response.status()).toBeGreaterThanOrEqual(400);
  }
  expect(
    (
      await api.post('/api/admin/assets/lookup', {
        data: { hash: 'a'.repeat(64), extension: 'png', size: 1 },
      })
    ).status(),
  ).toBeGreaterThanOrEqual(400);
  await api.dispose();
});

test('video previews play on hover and keyboard focus in both library views', async ({
  page,
  request,
}) => {
  const asset = await uploadVideo(request);

  async function expectInteractionPlayback(
    tile: ReturnType<Page['locator']>,
    focusTarget = tile,
  ) {
    await page.mouse.move(0, 0);
    await expect(tile.locator('[data-media-preview-pair]')).toBeVisible();
    const video = tile.locator('video.media-main');
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.paused), {
        timeout: 3_000,
      })
      .toBe(true);
    await focusTarget.focus();
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused), {
        timeout: 3_000,
      })
      .toBe(true);
    await page.getByRole('searchbox').focus();
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.paused), {
        timeout: 3_000,
      })
      .toBe(true);
    await tile.hover();
    await expect(tile.locator('[data-media-original-pair]')).toBeVisible();
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused), {
        timeout: 3_000,
      })
      .toBe(true);
  }

  await page.goto('/admin/assets/');
  await page.getByRole('combobox', { name: 'Used in' }).selectOption('unused');
  const storageRow = page.locator(`[data-asset-uuid="${asset.assetUuid}"]`);
  await expect(storageRow).toBeVisible();
  await expectInteractionPlayback(storageRow);

  await library(page);
  const sectionHeader = page
    .locator('[data-asset-library-section]')
    .filter({ hasText: 'Unused' });
  const restingHeaderBackground = await sectionHeader.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await sectionHeader.hover();
  await expect
    .poll(() =>
      sectionHeader.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(restingHeaderBackground);
  await sectionHeader.click();
  const reuseTile = page
    .locator(`[data-asset-uuid="${asset.assetUuid}"]`)
    .first();
  await expect(reuseTile).toBeVisible();
  const tile = reuseTile.locator('.group').first();
  const restingBorder = await tile.evaluate(
    (element) => getComputedStyle(element).borderColor,
  );
  await expectInteractionPlayback(reuseTile);
  await expect
    .poll(() =>
      tile.evaluate((element) => getComputedStyle(element).borderColor),
    )
    .not.toBe(restingBorder);
});
