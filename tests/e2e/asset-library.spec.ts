import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createOriginalAssetSettings } from '../../shared/asset-upload-settings';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
async function upload(api: APIRequestContext, name: string, color = '#4368a2') {
  const buffer = await sharp({
    create: { width: 80, height: 60, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  const response = await api.post('/api/admin/assets', {
    multipart: {
      file: { name, mimeType: 'image/png', buffer },
      familyUuid: `test-${randomUUID()}`,
      settings: JSON.stringify(createOriginalAssetSettings()),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return { asset: await response.json(), buffer };
}

async function uploadVideo(api: APIRequestContext) {
  const buffer = await readFile(
    fileURLToPath(
      new URL('./fixture/public/regression-video.mp4', import.meta.url),
    ),
  );
  const response = await api.post('/api/admin/assets', {
    multipart: {
      file: {
        name: 'library-hover-preview.mp4',
        mimeType: 'video/mp4',
        buffer,
      },
      familyUuid: `test-${randomUUID()}`,
      settings: JSON.stringify(createOriginalAssetSettings()),
    },
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
async function choose(page: Page, name: string) {
  const sectionsLoaded = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/admin/assets/library' &&
      url.searchParams.get('q') === name
    );
  });
  await page.getByRole('searchbox').fill(name);
  await sectionsLoaded;
  const assetButton = page.getByRole('button', { name, exact: true }).first();
  await page.getByText('Unused', { exact: true }).click();
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

test('hash lookup reuses stored bytes without multipart upload, including renamed files', async ({
  page,
  request,
}) => {
  const { asset, buffer } = await upload(request, 'hash-reuse.png');
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
    const first = await upload(
      request,
      `library-first-${width}.png`,
      width === 1280 ? '#763a55' : '#7d405b',
    );
    const second = await upload(
      request,
      `library-second-${width}.png`,
      width === 1280 ? '#1c5362' : '#245b69',
    );
    // Names are properties of the reused asset, so read back the canonical name.
    const firstName = first.asset.meta.originalName;
    const secondName = second.asset.meta.originalName;
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
    await choose(page, firstName);
    await expect(page.locator('[data-result]')).toContainText(
      first.asset.assetUuid,
    );
    await library(page, true);
    await choose(page, firstName);
    await expect(page.getByRole('searchbox')).toHaveValue(firstName);
    await choose(page, secondName);
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
    await page.getByRole('searchbox').fill(firstName);
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
    await page.screenshot({
      path: `tests/e2e/.artifacts/library-details-${width}.png`,
    });
    await page.keyboard.press('Escape');
    await library(page);
    await page.getByRole('searchbox').fill('ИСКОМОЕ');
    await expect(
      page.getByText('Library usage test', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: firstName, exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: `tests/e2e/.artifacts/library-${width}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-result]')).toHaveText('[]');
  });
}

test('library endpoints require admin access', async ({ playwright }) => {
  const api = await playwright.request.newContext({
    baseURL: 'http://127.0.0.1:3000',
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
  const name = asset.meta.originalName;

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
  await page.getByRole('searchbox').fill(name);
  const storageRow = page.locator(`[data-asset-uuid="${asset.assetUuid}"]`);
  await expect(storageRow).toBeVisible();
  await expectInteractionPlayback(
    storageRow.locator('.group').first(),
    storageRow,
  );

  await library(page);
  const filteredSections = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/admin/assets/library' &&
      url.searchParams.get('q') === name
    );
  });
  await page.getByRole('searchbox').fill(name);
  await filteredSections;
  await page.getByText('Unused', { exact: true }).click();
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
  const reuseTile = page.getByRole('button', { name, exact: true }).first();
  await expect(reuseTile).toBeVisible();
  const restingBackground = await reuseTile.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await expectInteractionPlayback(reuseTile);
  await expect
    .poll(() =>
      reuseTile.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe(restingBackground);
});
