import { expect, test, type Page, type Route } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { screenshot } from './screenshots';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

/**
 * A photo-like picture: noise over a gradient. The noise is the same on
 * every run, so every run encodes nearly the same bytes; the first few
 * pixels differ on every call. The file is then always new to the library:
 * a file stored as a variant keeps its original there for a day, and the
 * editor would open on that instead.
 */
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
  randomBytes(12).copy(noise);
  return await sharp(noise, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

function countRequests(page: Page) {
  const counts = { stage: 0, renders: 0, commit: 0 };
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path === '/api/admin/assets/drafts') counts.stage++;
    else if (/\/drafts\/[^/]+\/renders$/.test(path)) counts.renders++;
    else if (/\/drafts\/[^/]+\/commit$/.test(path)) counts.commit++;
  });
  return counts;
}

async function openBannerEditor(
  page: Page,
  buffer: Buffer,
  button = '[data-banner]',
) {
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator(button).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer });
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`a banner is cropped to its place and stored as rendered (${viewport.name})`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const counts = countRequests(page);
    await openBannerEditor(page, await photo(1600, 1200));

    // The place fixes 16:9, and the result is the largest it stores.
    await expect(
      page.getByLabel(/fixed\s+aspect\s+ratio:\s+16:9/),
    ).toBeVisible();
    const useResult = page.getByRole('button', {
      name: 'Use result',
      exact: true,
    });
    await expect(useResult).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByText('1200 × 675').first()).toBeVisible();
    // "Auto" names whichever format came out smallest.
    const auto = page.getByText(/(AVIF|WebP):\s+the\s+smallest/);
    await expect(auto).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('group', { name: /Crop\s+area/ }),
    ).toBeVisible();
    await screenshot(page, `asset-editor-${viewport.name}-crop`);

    // Dragging a corner makes a smaller crop and a new dry run.
    const rendersBefore = counts.renders;
    const handle = page.getByLabel('Resize the crop').last();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - box.width * 4, box.y - box.height * 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(useResult).toBeEnabled({ timeout: 20_000 });
    expect(counts.renders).toBeGreaterThan(rendersBefore);

    await page.getByRole('button', { name: 'Compare with the source' }).click();
    await expect(
      page.getByRole('separator', { name: 'Compare preview divider' }),
    ).toBeVisible();
    await screenshot(page, `asset-editor-${viewport.name}-compare`);

    const picked = (await auto.textContent())!.startsWith('AVIF')
      ? 'avif'
      : 'webp';
    // The dry runs of the other stops keep coming a few at a time; once they
    // have all been asked for, "Use" must not ask for another encode.
    await expect
      .poll(
        async () => {
          const seen = counts.renders;
          await page.waitForTimeout(800);
          return counts.renders === seen;
        },
        { timeout: 40_000 },
      )
      .toBe(true);
    const rendersBeforeUse = counts.renders;
    await useResult.click();
    await expect(page.locator('[data-result]')).toContainText('assetUuid');

    // The file went up once, and "Use" stored the render instead of
    // asking for another encode.
    expect(counts.stage).toBe(1);
    expect(counts.commit).toBe(1);
    expect(counts.renders).toBe(rendersBeforeUse);

    const [stored] = JSON.parse(
      (await page.locator('[data-result]').textContent())!,
    ) as { assetUuid: string }[];
    const usages = await request.get(
      `/api/admin/assets/${stored!.assetUuid}/usages`,
    );
    const { asset } = await usages.json();
    expect(asset.extension).toBe(picked);
    expect(asset.settings.crop.width / asset.settings.crop.height).toBeCloseTo(
      16 / 9,
      1,
    );
    expect(asset.settings).not.toHaveProperty('resizeMode');
    expect(asset.meta.sourceDimensions).toEqual({ width: 1600, height: 1200 });
  });
}

test('a free crop is taken on request, and the picture can be turned', async ({
  page,
  request,
}) => {
  await openBannerEditor(page, await photo(1600, 900), '[data-pick]');
  const useResult = page.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 20_000 });

  // Nothing is cut until the admin asks for it; then the frame covers it all.
  const frame = page.getByRole('group', { name: /Crop\s+area/ });
  await expect(frame).toHaveCount(0);
  const cropSwitch = page.getByRole('switch', { name: 'Crop' });
  await cropSwitch.click();
  await expect(frame).toHaveAccessibleName(/1600\s+×\s+900/);

  const handle = page.getByLabel('Resize the crop').first();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 4, box.y + box.height * 2, {
    steps: 8,
  });
  await page.mouse.up();
  await cropSwitch.click();
  // The crop stays on show, no longer editable.
  await expect(page.getByLabel('Resize the crop')).toHaveCount(0);
  await expect(frame).toBeVisible();

  await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
  await expect(frame).toHaveAccessibleName(/×/);
  await expect(useResult).toBeEnabled({ timeout: 20_000 });
  await useResult.click();
  await expect(page.locator('[data-result]')).toContainText('assetUuid');

  const [stored] = JSON.parse(
    (await page.locator('[data-result]').textContent())!,
  ) as { assetUuid: string }[];
  const usages = await request.get(
    `/api/admin/assets/${stored!.assetUuid}/usages`,
  );
  const { asset } = await usages.json();
  expect(asset.settings.rotation).toBe(90);
  // The crop is of the turned 900x1600 frame, the corner cut off the top
  // left of the picture now on its top right.
  expect(asset.settings.crop.left).toBe(0);
  expect(asset.settings.crop.top).toBeGreaterThan(0);
  expect(asset.settings.crop.width).toBeLessThan(900);
  expect(asset.meta.height).toBeGreaterThan(asset.meta.width);
  expect(asset.meta.sourceDimensions).toEqual({ width: 1600, height: 900 });
});

test('a flat graphic takes lossless WebP when that is the smallest', async ({
  page,
}) => {
  const graphic = await sharp({
    create: { width: 800, height: 450, channels: 3, background: '#ffffff' },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 300,
            height: 200,
            channels: 3,
            background: '#d01040',
          },
        })
          .png()
          .toBuffer(),
        left: 100,
        top: 100,
      },
    ])
    .png()
    .toBuffer();
  await openBannerEditor(page, graphic);

  await expect(page.getByText(/WebP\s+lossless:\s+the\s+smallest/)).toBeVisible(
    { timeout: 20_000 },
  );
  await expect(
    page.getByRole('button', { name: 'Use result', exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  // The bar stays: lossless is its last stop, and "Auto" landing on it at a
  // lossy level is the format list's business.
  await expect(page.getByRole('slider', { name: 'Quality' })).toHaveAttribute(
    'aria-valuetext',
    'High',
  );
});

test('an SVG is cropped and stays a vector', async ({ page, request }) => {
  // A comment of its own makes the drawing new to the library on every run.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 32 18">' +
      `<!-- ${randomUUID()} -->` +
      '<rect width="32" height="18" fill="#123"/><circle cx="16" cy="9" r="6" fill="#fc0"/></svg>',
  );
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator('[data-banner]').click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: svg,
  });

  // Auto keeps a vector a vector, and every other format is sized too.
  const formats = page.getByRole('radiogroup', { name: 'Format' });
  await expect(formats.getByRole('radio', { name: /^SVG/ })).toBeVisible();
  // A vector staying a vector needs no reason: "Auto" just names the format.
  await expect(
    formats.getByRole('radio', { name: /^Auto\s+SVG/ }),
  ).toBeVisible();
  const useResult = page.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 20_000 });
  // Auto, SVG, AVIF and WebP; lossless is a stop on the quality bar instead.
  await expect(formats.getByText(/%$/)).toHaveCount(4, { timeout: 20_000 });
  await useResult.click();
  await expect(page.locator('[data-result]')).toContainText('assetUuid');

  const [stored] = JSON.parse(
    (await page.locator('[data-result]').textContent())!,
  ) as { assetUuid: string }[];
  const content = await request.get(
    `/api/admin/assets/${stored!.assetUuid}/content`,
  );
  const text = await content.text();
  // The source is already 16:9, so the whole drawing is kept and only its
  // size becomes the banner's.
  expect(text).toContain('viewBox="0 0 32 18"');
  expect(text).toContain('width="1200" height="675"');
  expect(text).toContain('<circle');
});

test('"Use result" is ready with the render "Auto" stands on, before the other formats are weighed', async ({
  page,
}) => {
  // Every render but the AVIF stand-in is held back.
  const held: Route[] = [];
  await page.route('**/api/admin/assets/drafts/*/renders', async (route) => {
    const body = route.request().postDataJSON() as {
      settings?: { format?: string };
    };
    if (body?.settings?.format === 'avif') await route.continue();
    else held.push(route);
  });
  await openBannerEditor(page, await photo(800, 600));
  const useResult = page.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 20_000 });
  expect(held.length).toBeGreaterThan(0);
  // "Auto" has not settled: nothing is named the smallest yet.
  await expect(page.getByText(/the\s+smallest/)).toHaveCount(0);

  for (const route of held.splice(0)) await route.continue().catch(() => {});
  await expect(page.getByText(/(AVIF|WebP):\s+the\s+smallest/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(useResult).toBeEnabled();
});

test('a change of settings drops the dry runs still under way', async ({
  page,
}) => {
  const held: Route[] = [];
  await page.route('**/api/admin/assets/drafts/*/renders', async (route) => {
    held.push(route);
  });
  const failed: string[] = [];
  page.on('requestfailed', (request) => {
    if (/\/renders$/.test(new URL(request.url()).pathname))
      failed.push(request.url());
  });
  await openBannerEditor(page, await photo(800, 600));
  await expect.poll(() => held.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const dropped = held.length;

  // Another size: every render under way is of the old one, and goes at
  // once. (Another stop would drop nothing: the other stops are rendered
  // too, nearest first, so their keys stay wanted.)
  await page.getByRole('button', { name: '720', exact: true }).click();
  await expect(page.getByText('720 × 405').first()).toBeVisible();
  await page.waitForTimeout(300);
  // A held request the page has already given up fails the moment it is let
  // through.
  for (const route of held.splice(0)) await route.continue().catch(() => {});
  await expect.poll(() => failed.length).toBe(dropped);

  // Whatever the change asked for afterwards is let through as well.
  await page.waitForTimeout(500);
  for (const route of held.splice(0)) await route.continue().catch(() => {});
});

test('a commit under way can be cancelled', async ({ page }) => {
  const held: Route[] = [];
  await page.route('**/api/admin/assets/drafts/*/commit', async (route) => {
    held.push(route);
  });
  await openBannerEditor(page, await photo(800, 600));
  const useResult = page.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 20_000 });
  await useResult.click();
  // While the commit runs, the button says so instead, and Cancel appears.
  await expect.poll(() => held.length).toBe(1);
  await expect(useResult).toHaveCount(0);
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();

  await expect(useResult).toBeEnabled();
  await expect(cancel).toHaveCount(0);
  await expect(page.locator('[data-result]')).toHaveText('[]');
  for (const route of held.splice(0)) await route.abort().catch(() => {});
});

test('a video variant is made as a job the editor follows', async ({
  page,
  request,
}) => {
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator('[data-pick]').click();
  await page
    .locator('input[type=file]')
    .setInputFiles(
      fileURLToPath(
        new URL('./fixture/media/regression-video.mp4', import.meta.url),
      ),
    );

  // The editor opens on the video with "Use as is" up; the settings live in
  // the "Create variant" section, whose action carries the same name.
  const createVariant = page.getByRole('button', {
    name: 'Create variant',
    exact: true,
  });
  await createVariant.first().click();
  await page.getByText('Fast conversion', { exact: true }).click();
  const polls: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'GET' && /\/api\/admin\/uploads\//.test(req.url()))
      polls.push(req.url());
  });
  const commit = page.waitForResponse((response) =>
    /\/drafts\/[^/]+\/commit$/.test(new URL(response.url()).pathname),
  );
  await createVariant.last().click();
  // The request is answered at once; the encode is followed by polling.
  expect((await commit).status()).toBe(202);

  const useResult = page.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 90_000 });
  expect(polls.length).toBeGreaterThan(0);
  await useResult.click();
  await expect(page.locator('[data-result]')).toContainText('assetUuid');
  const [stored] = JSON.parse(
    (await page.locator('[data-result]').textContent())!,
  ) as { assetUuid: string }[];
  const usages = await request.get(
    `/api/admin/assets/${stored!.assetUuid}/usages`,
  );
  const { asset } = await usages.json();
  expect(asset.extension).toBe('webm');
  expect(asset.settings.type).toBe('video-transform');
});

test('the quality bar walks its stops from the keyboard and by a tap', async ({
  page,
}) => {
  await openBannerEditor(page, await photo(800, 600));
  const bar = page.getByRole('slider', { name: 'Quality' });
  await expect(bar).toHaveAttribute('aria-valuetext', 'High');
  const useResult = page.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 20_000 });

  // Every stop is captioned with a size once its dry run is in.
  const captions = page.locator('[role=slider] + div > span');
  await expect(captions).toHaveCount(6);
  await expect(captions.last()).toHaveText(/(bytes|Kb|Mb)$/, {
    timeout: 20_000,
  });

  // Lossless is the last stop, and a format as much as a level: "Auto" says
  // so, and AVIF, which has no lossless mode, cannot be picked there.
  await bar.focus();
  await page.keyboard.press('End');
  await expect(bar).toHaveAttribute('aria-valuetext', 'Lossless');
  const formats = page.getByRole('radiogroup', { name: 'Format' });
  await expect(
    formats.getByRole('radio', { name: /^Auto\s+WebP\s+lossless/ }),
  ).toBeVisible();
  await expect(formats.getByRole('radio', { name: /^AVIF/ })).toBeDisabled();
  await page.keyboard.press('Home');
  await expect(bar).toHaveAttribute('aria-valuetext', 'Minimal');
  await expect(formats.getByRole('radio', { name: /^AVIF/ })).toBeEnabled();

  // A tap picks the stop under it: the third column of six is Medium.
  const box = (await bar.boundingBox())!;
  await page.mouse.click(box.x + (box.width * 2.5) / 6, box.y + box.height / 2);
  await expect(bar).toHaveAttribute('aria-valuetext', 'Medium');
  await expect(useResult).toBeEnabled({ timeout: 20_000 });
});
