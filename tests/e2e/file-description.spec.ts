import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createOriginalAssetSettings } from '../../shared/asset-upload-settings';
import { buildUploadHeaders } from '../../shared/api/asset-upload-headers';
import { E2E_ORIGIN } from './fixture-url';
import { screenshot } from './screenshots';

/**
 * A file's description — «Описание файла» — as the owner writes it in the
 * file's window and the site reads it back: the library finds the file by
 * it, and a public page shows it — as a picture's alt, in the file's window
 * and in the Markdown copy — only for a file it shows publicly.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

/** A picture of its own colour, so every run stores new bytes. */
async function upload(request: APIRequestContext) {
  const [r, g, b] = [0, 0, 0].map(() => Math.floor(Math.random() * 256));
  const buffer = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
  const response = await request.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension: 'png',
    }),
    data: buffer,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { assetUuid: string };
}

/** A text file of its own words, so every run stores new bytes. */
async function uploadText(request: APIRequestContext, words: string) {
  const response = await request.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension: 'txt',
    }),
    data: Buffer.from(words),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { assetUuid: string };
}

async function describeFile(
  request: APIRequestContext,
  assetUuid: string,
  text: string,
) {
  const read = await (
    await request.get(`/api/admin/assets/${assetUuid}/description`)
  ).json();
  const response = await request.put(
    `/api/admin/assets/${assetUuid}/description`,
    { data: { text, expectedUpdatedAt: read.updatedAt } },
  );
  expect(response.ok(), await response.text()).toBe(true);
}

/** Opens a page once it answers clicks and keys. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

test('a description typed in the file’s window finds the file in the library', async ({
  page,
  request,
}) => {
  const run = randomUUID().slice(0, 8);
  const file = await upload(request);
  await page.setViewportSize({ width: 960, height: 720 });
  await open(page, '/admin/assets/');
  await expect(page.locator('[data-admin-assets-ready]')).toHaveAttribute(
    'data-admin-assets-ready',
    'true',
  );
  // The newest file leads the list.
  await page.locator(`[data-asset-uuid="${file.assetUuid}"]`).first().click();
  const input = page.locator('[data-file-description-input]');
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('');
  await input.fill(`A lighthouse full of gulls ${run}`);
  await page.locator('[data-file-description-save]').click();
  await expect(page.locator('[data-file-description-notice]')).toHaveText(
    'File description saved',
  );
  await expect(page.locator('[data-file-description-save]')).toHaveCount(0);
  await screenshot(page, 'file-description-960');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[data-file-description]').scrollIntoViewIfNeeded();
  await screenshot(page, 'file-description-375');
  await page.setViewportSize({ width: 960, height: 720 });

  // Read again, it is there; and a save over an older version is refused.
  const stored = await (
    await request.get(`/api/admin/assets/${file.assetUuid}/description`)
  ).json();
  expect(stored.text).toBe(`A lighthouse full of gulls ${run}`);
  const stale = await request.put(
    `/api/admin/assets/${file.assetUuid}/description`,
    { data: { text: 'Something else', expectedUpdatedAt: null } },
  );
  expect(stale.status()).toBe(409);

  // The page answers once the window has faded out.
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('searchbox').fill(`gulls ${run}`);
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(
    page.locator(`[data-asset-uuid="${file.assetUuid}"]`).first(),
  ).toBeVisible();
  await expect(page.locator('[data-asset-uuid]')).toHaveCount(1);
});

test('the public window and the Markdown copy show it only for a public file', async ({
  page,
  request,
  playwright,
}) => {
  const run = randomUUID().slice(0, 8);
  const shown = await upload(request);
  const hidden = await upload(request);
  await describeFile(
    request,
    shown.assetUuid,
    `Seagulls circling pier lamps ${run}`,
  );
  await describeFile(request, hidden.assetUuid, `Secret letter ${run}`);
  const ticket = await uploadText(request, `Row 7, seat ${run}`);
  await describeFile(request, ticket.assetUuid, `Ferry ticket stub ${run}`);
  const created = await request.post('/api/admin/events', {
    data: {
      title: `By the sea ${run}`,
      summary: 'A day at the pier.',
      access: 'public',
      humanReadableSlug: 'by-the-sea',
      publicId: `sea${run}`,
      content: {
        data: {
          blocks: [
            { type: 'paragraph', data: { text: 'We walked to the pier.' } },
            {
              type: 'contentMedia',
              data: {
                layout: 'centered',
                asset: { assetUuid: shown.assetUuid },
              },
            },
            {
              type: 'contentAttachment',
              data: {
                title: 'Ticket',
                asset: { assetUuid: ticket.assetUuid },
              },
            },
          ],
        },
      },
      periods: [
        {
          startDate: '2012-07-01',
          endDate: '2012-07-01',
          precision: 'exact',
          precisionNote: '',
          label: '',
        },
      ],
      // A file only the owner sees on the page.
      otherAssets: [
        { assetUuid: hidden.assetUuid, title: 'Letter', isPrivate: true },
      ],
    },
  });
  const body = await created.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  const path = `/events/by-the-sea-sea${run}/`;

  // A stranger: no session of the owner's.
  const stranger = await playwright.request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: { cookies: [], origins: [] },
  });
  const markdown = await (await stranger.get(`${path}index.md`)).text();
  expect(markdown).toContain(`![Seagulls circling pier lamps ${run}](`);
  expect(markdown).not.toContain('Secret letter');
  // A file's link carries what it is as its title.
  expect(markdown).toMatch(
    new RegExp(`\\[Ticket\\]\\([^ )]+ "Ferry ticket stub ${run}"\\)`),
  );
  const html = await (await stranger.get(path)).text();
  expect(html).toContain(`Seagulls circling pier lamps ${run}`);
  expect(html).not.toContain('Secret letter');
  await stranger.dispose();

  // The picture says what it shows, and its window says it in words.
  const visitor = await page
    .context()
    .browser()!
    .newContext({
      baseURL: E2E_ORIGIN,
      storageState: { cookies: [], origins: [] },
    });
  const guest = await visitor.newPage();
  await open(guest, path);
  await expect(
    guest.locator(`img[alt="Seagulls circling pier lamps ${run}"]`).first(),
  ).toBeAttached();
  await guest
    .getByRole('button', { name: `Seagulls circling pier lamps ${run}` })
    .click();
  const block = guest.locator('[data-public-asset-description]');
  await expect(block).toBeVisible();
  await expect(block).toContainText(`Seagulls circling pier lamps ${run}`);
  // With no title, the window is named by what the file is.
  await expect(guest.locator('[data-asset-panel-title]')).toHaveText('Image');
  await screenshot(guest, 'file-description-public');
  await guest.keyboard.press('Escape');
  // A file in the text says what it is to whoever cannot see it.
  await expect(
    guest.getByRole('button', { name: `Ticket Ferry ticket stub ${run}` }),
  ).toBeVisible();
  await visitor.close();
});
