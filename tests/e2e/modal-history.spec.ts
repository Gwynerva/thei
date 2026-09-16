import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createOriginalAssetSettings } from '../../shared/asset-upload-settings';
import { buildUploadHeaders } from '../../shared/api/asset-upload-headers';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

function png(color: string) {
  return sharp({
    create: { width: 80, height: 60, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

async function storeAsset(api: APIRequestContext, color: string) {
  const response = await api.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension: 'png',
    }),
    data: await png(color),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()).assetUuid as string;
}

async function openWizard(page: Page) {
  await page.goto('/asset-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page.locator('[data-pick]').click();
  await expect(
    page.getByRole('button', { name: 'Reuse', exact: true }),
  ).toBeVisible();
}

/**
 * The sentinel history entry keeps the URL, so a Back press resolves without a
 * navigation and `page.goBack()` would sit waiting for a load that never comes.
 */
async function pressBack(page: Page) {
  await page.evaluate(() => window.history.back());
}

async function chooseFromLibrary(page: Page, assetUuid: string) {
  const asset = page.locator(`[data-asset-uuid="${assetUuid}"]`).first();
  // A freshly stored asset has no placements yet, so it sits under "Unused",
  // where the newest come first.
  await page
    .locator('[data-asset-library-section]')
    .filter({ hasText: 'Unused' })
    .click();
  await expect(asset).toBeVisible();
  await asset.click();
}

const pickScreen = (page: Page) =>
  page.getByRole('button', { name: 'Reuse', exact: true });
const libraryScreen = (page: Page) => page.getByRole('searchbox');
// "Create variant" names both the section toggle and the button inside it, so
// the screen marker takes the first match and the action takes the last.
const variantScreen = (page: Page) =>
  page.getByRole('button', { name: 'Create variant', exact: true }).first();

test('browser Back closes one nested modal per press and never leaves the page', async ({
  page,
  request,
}) => {
  const stored = await storeAsset(request, '#4368a2');
  await openWizard(page);

  await pickScreen(page).click();
  await expect(libraryScreen(page)).toBeVisible();

  // Choosing from the library opens the variant screen as a real nested modal,
  // so the stack is two deep here.
  await chooseFromLibrary(page, stored);
  await expect(variantScreen(page)).toBeVisible();

  // One press used to close the variant screen, the library under it, and then
  // the pick screen the wizard reopened — three modals for one Back.
  await pressBack(page);
  await expect(variantScreen(page)).toHaveCount(0);
  await expect(libraryScreen(page)).toBeVisible();

  await pressBack(page);
  await expect(libraryScreen(page)).toHaveCount(0);
  await expect(pickScreen(page)).toBeVisible();

  await pressBack(page);
  await expect(pickScreen(page)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/asset-regression');
});

test('Escape undoes the same single step as Back', async ({
  page,
  request,
}) => {
  const stored = await storeAsset(request, '#7a4368');
  await openWizard(page);

  await pickScreen(page).click();
  await chooseFromLibrary(page, stored);
  await expect(variantScreen(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(variantScreen(page)).toHaveCount(0);
  await expect(libraryScreen(page)).toBeVisible();
});

test('going back from Reuse and uploading instead still delivers the asset', async ({
  page,
}) => {
  await openWizard(page);

  // The reported sequence: Reuse, Back, then Upload after all.
  await pickScreen(page).click();
  await expect(libraryScreen(page)).toBeVisible();
  await pressBack(page);
  await expect(pickScreen(page)).toBeVisible();

  await page.locator('input[type=file]').setInputFiles({
    name: 'after-back.png',
    mimeType: 'image/png',
    buffer: await png('#43a268'),
  });
  // "Create variant", then "Use result" — the two clicks from the report. The
  // first click opens the section, the second runs the encode inside it.
  const createVariant = page.getByRole('button', {
    name: 'Create variant',
    exact: true,
  });
  await createVariant.first().click();
  await createVariant.last().click();
  const useResult = page.getByRole('button', {
    name: 'Use result',
    exact: true,
  });
  await expect(useResult).toBeEnabled({ timeout: 30_000 });
  await useResult.click();

  // The wizard has to hand the asset back, and the page must still be here:
  // the stale sentinel used to turn the next Back into a real navigation.
  await expect(page.locator('[data-result]')).toContainText('assetUuid');
  await expect(page.locator('[data-picking]')).toHaveAttribute(
    'data-picking',
    'false',
  );
  expect(new URL(page.url()).pathname).toBe('/asset-regression');
});
