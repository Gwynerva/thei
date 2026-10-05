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
  const video = await readFile(
    fileURLToPath(
      new URL('./fixture/media/regression-video.mp4', import.meta.url),
    ),
  );
  // A `free` box after the file gives the same video new bytes, so it is
  // stored and given its preview afresh, not found as an earlier run left it.
  const filler = Buffer.from(randomUUID());
  const free = Buffer.alloc(8);
  free.writeUInt32BE(free.length + filler.length, 0);
  free.write('free', 4, 'latin1');
  const buffer = Buffer.concat([video, free, filler]);
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

test('the library narrows to one kind of entity and finds a diary entry by its day in words', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { asset } = await upload(request, '#3d6b4f');
  // One file nothing holds, so the unused ones are never an empty choice.
  await upload(request, '#6b3d5a');
  // A day no earlier run is likely to have taken: one entry per day.
  const random = (size: number) => 1 + Math.floor(Math.random() * size);
  // Past the 12th, the day cannot be read as a month the other way round.
  const [year, month, day] = [1900 + random(99), random(12), 12 + random(16)];
  const date = [year, month, day]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  const created = await request.post('/api/admin/diary', {
    data: {
      date,
      access: 'public',
      content: {
        data: {
          blocks: [
            {
              id: 'media',
              type: 'contentMedia',
              data: {
                layout: 'centered',
                asset: { assetUuid: asset.assetUuid },
              },
            },
          ],
        },
      },
    },
  });
  const saved = await created.json();
  expect(saved.type, JSON.stringify(saved)).toBe('success');
  const monthName = new Intl.DateTimeFormat('en', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));

  await library(page);
  // Every kind of file is offered, audio too, whatever this picker takes.
  const type = page.getByRole('button', { name: /^Format: / });
  await expect(type).toHaveAccessibleName('Format: Any file');
  await type.click();
  await expect(
    page.getByRole('listbox', { name: 'Format' }).getByRole('option'),
  ).toHaveText([/Any file/, /Image/, /Video/, /Audio/, /Other Files/]);
  await page.keyboard.press('Escape');

  const source = page.getByRole('button', { name: /^Used in: / });
  await expect(source).toHaveAccessibleName('Used in: Anywhere');
  await source.click();
  const kinds = page.getByRole('listbox', { name: 'Used in' });
  await expect(kinds.getByRole('option')).toHaveText([
    /Anywhere/,
    /Projects/,
    /Project sections/,
    /Events/,
    /Diary entries/,
    /Pages/,
    /In\suse/,
    /Unused/,
  ]);
  await kinds.getByRole('option').filter({ hasText: 'Diary entries' }).click();
  await expect(source).toHaveAccessibleName('Used in: Diary entries');
  await page.getByRole('searchbox').fill(`${monthName} ${day}, ${year}`);
  const sections = page.locator('[data-asset-library-section]');
  await expect(sections).toHaveCount(1);
  // Named by its day written out, not by the stored date.
  await expect(sections).toContainText(`${monthName} ${day}, ${year}`);
  await expect(
    page.locator(`[data-asset-uuid="${asset.assetUuid}"]`).first(),
  ).toBeVisible();

  // The same day in numbers: one diary entry, and no page to narrow to.
  await page.getByRole('searchbox').fill(`${day}.${month}.${year}`);
  await expect(sections).toHaveCount(1);
  await source.click();
  await expect(
    kinds.getByRole('option').filter({ hasText: 'Diary entries' }),
  ).toContainText('1');
  await expect(
    kinds.getByRole('option').filter({ hasText: 'Pages' }),
  ).toHaveAttribute('aria-disabled', 'true');
  await kinds.getByRole('option').filter({ hasText: 'Anywhere' }).click();
  await expect(source).toHaveAccessibleName('Used in: Anywhere');
  await expect(sections).toHaveCount(1);

  // Narrowed to where nothing is found, the list says so and how to widen.
  await source.click();
  await kinds.getByRole('option').filter({ hasText: 'Diary entries' }).click();
  await page.getByRole('searchbox').fill(`${day}.${month}.${year} nowhere`);
  const empty = page.locator('[data-asset-library-empty]');
  await expect(empty).toBeVisible();
  await empty.getByRole('button', { name: /Anywhere/ }).click();
  await expect(source).toHaveAccessibleName('Used in: Anywhere');
  await page.keyboard.press('Escape');

  // The storage page searches the same way, and keeps it in its address.
  await page.goto('/admin/assets/');
  await expect(page.locator('[data-admin-assets-ready]')).toHaveAttribute(
    'data-admin-assets-ready',
    'true',
  );
  await page.getByRole('button', { name: /^Used in: / }).click();
  await page
    .getByRole('listbox', { name: 'Used in' })
    .getByRole('option')
    .filter({ hasText: 'Diary entries' })
    .click();
  await expect(page).toHaveURL(/[?&]source=diary-entry/);
  await page.getByRole('searchbox').fill(`${monthName} ${day}, ${year}`);
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(
    page.locator(`[data-asset-uuid="${asset.assetUuid}"]`),
  ).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await expect(page).not.toHaveURL(/[?&]q=/);
  await page.getByRole('button', { name: /^Used in: / }).click();
  await page
    .getByRole('listbox', { name: 'Used in' })
    .getByRole('option')
    .filter({ hasText: 'Unused' })
    .click();
  await expect(page).toHaveURL(/[?&]usage=unused/);
  await expect(page).not.toHaveURL(/source=/);
});

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
    const video = tile.locator('video.media-main');
    // At rest a tile shows the preview, and the video is not even fetched
    // until the tile is engaged.
    await expect(tile.locator('[data-media-preview-state]')).toHaveAttribute(
      'data-media-preview-state',
      'visible',
    );
    await expect(video).toHaveCount(0);
    // `evaluateAll` reads the video as it is; `evaluate` would wait for one
    // still being mounted, past the poll's own timeout.
    const playing = () =>
      video.evaluateAll((elements) =>
        elements.every((element) => !(element as HTMLVideoElement).paused),
      );
    await focusTarget.focus();
    await expect(video).toHaveCount(1);
    await expect.poll(playing, { timeout: 3_000 }).toBe(true);
    await page.getByRole('searchbox').focus();
    await expect.poll(playing, { timeout: 3_000 }).toBe(false);
    await tile.hover();
    await expect(tile.locator('[data-media-original-pair]')).toBeVisible();
    await expect.poll(playing, { timeout: 3_000 }).toBe(true);
  }

  await page.goto('/admin/assets/');
  await page.getByRole('button', { name: /^Used in: / }).click();
  await page
    .getByRole('listbox', { name: 'Used in' })
    .getByRole('option')
    .filter({ hasText: 'Unused' })
    .click();
  await expect(page).toHaveURL(/[?&]usage=unused/);
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
