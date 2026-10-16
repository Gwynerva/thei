import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createOriginalAssetSettings } from '../../shared/asset-upload-settings';
import { buildUploadHeaders } from '../../shared/api/asset-upload-headers';
import { skipDescription, uploadControls } from './helpers/upload';

/**
 * On a slow network a modal opens at once in its frame, with its title, and
 * its code and data fill it in when they come; a flow going from one step to
 * the next never closes the dialog or shows the page through it.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** A picture no run has stored before: its first pixels are random. */
async function picture() {
  const pixels = Buffer.alloc(160 * 120 * 3, 120);
  randomBytes(64).copy(pixels);
  return await sharp(pixels, { raw: { width: 160, height: 120, channels: 3 } })
    .png()
    .toBuffer();
}

async function store(api: APIRequestContext) {
  const response = await api.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension: 'png',
    }),
    data: await picture(),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).assetUuid as string;
}

const CODE_DELAY = 1_200;
const DATA_DELAY = 2_500;

/**
 * From now on code loaded on demand and the file storage's answers come
 * late: the page itself has loaded, the modals' chunks have not. What the
 * library could offer is held until the test lets it go.
 */
async function slowNetwork(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_nuxt\/.+\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, CODE_DELAY));
    await route.continue();
  });
  await page.route(/\/api\/admin\/assets/, async (route) => {
    if (route.request().url().includes('/availability')) await released;
    else await new Promise((resolve) => setTimeout(resolve, DATA_DELAY));
    await route.continue();
  });
  return { releaseAvailability: release };
}

/**
 * Records, frame by frame, whether the dialog is open and how much it covers:
 * the opacity of its most opaque layer on show.
 */
async function watchCover(page: Page) {
  await page.evaluate(() => {
    const record = window as unknown as {
      cover: { open: boolean; opacity: number; layers: string }[];
      coverFrame: number;
    };
    record.cover = [];
    const frame = () => {
      const dialog = document.querySelector('dialog');
      const layers = dialog?.open
        ? [
            ...dialog.querySelectorAll<HTMLElement>('[data-modal-layer]'),
          ].filter((layer) => !layer.hidden)
        : [];
      const opacities = layers.map((layer) =>
        Number(getComputedStyle(layer).opacity),
      );
      record.cover.push({
        open: Boolean(dialog?.open),
        opacity: Math.max(0, ...opacities),
        layers: layers
          .map(
            (layer, index) =>
              `${layer.dataset.modalLayer}:${opacities[index]!.toFixed(2)}`,
          )
          .join(' '),
      });
      record.coverFrame = requestAnimationFrame(frame);
    };
    frame();
  });
}

/** Every frame since the dialog first covered the window. */
async function coverSinceShown(page: Page) {
  const cover = await page.evaluate(() => {
    const record = window as unknown as {
      cover: { open: boolean; opacity: number; layers: string }[];
      coverFrame: number;
    };
    cancelAnimationFrame(record.coverFrame);
    return record.cover;
  });
  const first = cover.findIndex((frame) => frame.opacity > 0.99);
  expect(first, 'the dialog never covered the window').toBeGreaterThan(-1);
  return cover.slice(first);
}

async function expectNeverEmpty(page: Page) {
  const frames = await coverSinceShown(page);
  expect(frames.length).toBeGreaterThan(10);
  expect(frames.filter((frame) => !frame.open)).toEqual([]);
  const thin = frames.findIndex((frame) => frame.opacity <= 0.99);
  expect(
    thin,
    `the page showed through: ${JSON.stringify(frames.slice(Math.max(0, thin - 3), thin + 3))}`,
  ).toBe(-1);
}

const dialog = (page: Page) => page.locator('dialog[open]');

test('the picker, the library and the editor each stand in their frame at once', async ({
  page,
  request,
}) => {
  const assetUuid = await store(request);
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const { releaseAvailability } = await slowNetwork(page);
  await watchCover(page);

  await page.locator('[data-pick]').click();
  // The picker's code is still on its way: its frame says what it is.
  await expect(
    dialog(page).getByRole('heading', { name: 'Choose a file' }),
  ).toBeVisible({ timeout: 600 });
  await expect(
    dialog(page).getByRole('button', { name: 'Upload', exact: true }),
  ).toHaveCount(0);

  // The picker arrives before the library has said what it holds: "Reuse"
  // is drawn from the start, waiting.
  const reuse = dialog(page).getByRole('button', {
    name: 'Reuse',
    exact: true,
  });
  await expect(reuse).toHaveAttribute('aria-busy', 'true', { timeout: 10_000 });
  await expect(reuse).toBeDisabled();
  releaseAvailability();
  await expect(reuse).toBeEnabled({ timeout: 10_000 });
  await reuse.click();

  await expect(
    dialog(page).getByRole('heading', { name: 'File storage' }),
  ).toBeVisible({ timeout: 600 });
  // The newest come first among the unused; the first section may already
  // be open.
  const unused = dialog(page)
    .locator('details')
    .filter({
      has: page.locator('[data-asset-library-section]', { hasText: 'Unused' }),
    });
  await expect(unused).toBeVisible({ timeout: 10_000 });
  if ((await unused.getAttribute('open')) === null)
    await unused.locator('[data-asset-library-section]').click();
  const asset = page.locator(`[data-asset-uuid="${assetUuid}"]`).first();
  await expect(asset).toBeVisible({ timeout: 10_000 });
  await asset.click();

  // The editor opens over the library at once and fetches the file itself.
  await expect(
    dialog(page).getByText('How to take the file', { exact: true }).first(),
  ).toBeVisible({ timeout: 600 });
  const { next } = uploadControls(page);
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await expectNeverEmpty(page);

  await next.click();
  await skipDescription(page, 10_000);
  await expect(page.locator('[data-result]')).toContainText(assetUuid, {
    timeout: 10_000,
  });
  await expect(dialog(page)).toHaveCount(0);
});

test('a file goes from its details to the editor and back without the page showing through', async ({
  page,
}) => {
  const stamp = Date.now();
  const created = await page.request.post('/api/admin/projects', {
    data: {
      title: `Slow ${stamp}`,
      summary: 'A project on a slow network.',
      access: 'public',
      humanReadableSlug: 'slow',
      publicId: `slow${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: {
        data: { blocks: [{ type: 'paragraph', data: { text: 'Slow.' } }] },
      },
    },
  });
  const projectUuid = (await created.json()).projectUuid as string;
  await page.goto(`/admin/projects/${projectUuid}/edit/`);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );

  // A picture placed in the showcase while the network is still quick.
  await page
    .getByRole('button', { name: 'Add to Showcase', exact: true })
    .click();
  await dialog(page)
    .locator('input[type=file]')
    .setInputFiles({
      name: 'slow.png',
      mimeType: 'image/png',
      buffer: await picture(),
    });
  await uploadControls(page).next.click();
  await skipDescription(page);
  await expect(
    dialog(page).getByRole('textbox', { name: 'Caption', exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  (await slowNetwork(page)).releaseAvailability();
  await page
    .getByRole('button', { name: 'Details', exact: true })
    .first()
    .click();
  await watchCover(page);
  await expect(
    dialog(page).getByRole('textbox', { name: 'Caption', exact: true }),
  ).toBeVisible({
    timeout: 10_000,
  });

  // "Change" opens the editor at once; it fetches the file's family itself.
  await dialog(page)
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  await expect(
    dialog(page).getByText('How to take the file', { exact: true }).first(),
  ).toBeVisible({ timeout: 600 });
  await expect(uploadControls(page).newVariant).toBeVisible({
    timeout: 10_000,
  });

  // Closed, the editor gives the details back.
  await page.keyboard.press('Escape');
  await expect(
    dialog(page).getByRole('textbox', { name: 'Caption', exact: true }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expectNeverEmpty(page);
});
