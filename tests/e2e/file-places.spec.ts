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
 * A visitor's window of a file lists the other pages it is shown on, to go
 * on to — and only those a stranger may find and would see the file on: a
 * page open by its link alone, a private page or a private file stays
 * unnamed.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

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
  return (await response.json()) as { assetUuid: string; slug: string };
}

/** Opens a page once it answers clicks and keys. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

test('the window names the other public pages the file is on, and goes there', async ({
  page,
  request,
}) => {
  const run = randomUUID().slice(0, 8);
  const picture = await upload(request);
  const media = (id: string) => ({
    id,
    type: 'contentMedia',
    data: { layout: 'centered', asset: { assetUuid: picture.assetUuid } },
  });
  async function pageWith(
    title: string,
    access: string,
    extra: Record<string, unknown> = {},
  ) {
    const slug = `places-${title.toLowerCase().replace(/\W+/g, '-')}-${run}`;
    const response = await request.post('/api/admin/pages', {
      data: {
        title: `${title} ${run}`,
        summary: 'A page with a picture.',
        slug,
        access,
        content: { data: { blocks: [media('picture')] } },
        ...extra,
      },
    });
    const body = await response.json();
    expect(body.type, JSON.stringify(body)).toBe('success');
    return `/pages/${slug}/`;
  }
  const opened = await pageWith('Harbour', 'public');
  await pageWith('Lighthouse', 'public', { iconAssetUuid: picture.assetUuid });
  await pageWith('By link', 'link-only');
  await pageWith('Private', 'private');

  // A stranger: no session of the owner's.
  const visitor = await page
    .context()
    .browser()!
    .newContext({
      baseURL: E2E_ORIGIN,
      storageState: { cookies: [], origins: [] },
      viewport: { width: 960, height: 720 },
    });
  const guest = await visitor.newPage();
  await open(guest, opened);
  await expect(
    guest.locator(`img[src*="${picture.slug}"]`).first(),
  ).toBeAttached();
  // The picture's own button opens its window: the page holds no other.
  await guest.getByRole('button', { name: 'Asset', exact: true }).click();

  const places = guest.locator('[data-asset-places]');
  await expect(places).toBeVisible();
  // Not the page the window is open over, and none a stranger cannot find.
  const chips = places.locator('[data-asset-usage]');
  await expect(chips).toHaveCount(1);
  await expect(chips).toContainText(`Lighthouse ${run}`);
  await expect(chips.locator('[data-asset-usage-uses]')).toHaveText(
    'Icon · Page content',
  );
  const answer = await (
    await visitor.request.get(`/api/files/${picture.slug}/places`)
  ).text();
  expect(answer).not.toContain('By link');
  expect(answer).not.toContain('Private');
  await screenshot(guest, 'file-places-960');

  // The chip goes to the page, the window closing on the way.
  await chips.click();
  await expect(guest).toHaveURL(
    new RegExp(`/pages/places-lighthouse-${run}/$`),
  );
  await expect(guest.locator('dialog[open]')).toHaveCount(0);
  await guest.goBack();
  await expect(guest).toHaveURL(new RegExp(`${opened}$`));
  await expect(guest.locator('dialog[open]')).toHaveCount(0);
  await visitor.close();
});
