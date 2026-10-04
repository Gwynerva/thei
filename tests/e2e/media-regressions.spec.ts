import { expect, test, type Page } from '@playwright/test';

let releaseSlowImages: () => void;

test.beforeEach(async ({ page }) => {
  const slowImageGate = new Promise<void>((resolve) => {
    releaseSlowImages = resolve;
  });
  await page.route('**/*regression-image.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    }),
  );
  await page.route('**/slow-image.svg', async (route) => {
    await slowImageGate;
    await route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    });
  });
  await page.goto('/media-regression');
  await expect(page.locator('[data-editor] [data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
});

async function close(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).not.toBeVisible();
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`image hit areas, captions and header at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const root = page.locator('[data-renderer]');
    const card = root.locator('figure').first();
    await card.getByText('Image caption', { exact: true }).click();
    await expect(page.locator('dialog')).not.toBeVisible();
    const frame = card.locator('[data-content-media-layout]');
    const button = card.getByRole('button', {
      name: 'Image caption',
      exact: true,
    });
    const frameBox = await frame.boundingBox();
    expect(await button.boundingBox()).toEqual(frameBox);
    const cardBox = await card.boundingBox();
    if (cardBox!.width > frameBox!.width + 10) {
      await page.mouse.click(cardBox!.x + cardBox!.width - 3, frameBox!.y + 10);
      await expect(page.locator('dialog')).not.toBeVisible();
    }
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.locator('dialog').getByText('Image caption', { exact: true }),
    ).toHaveCount(1);
    await close(page);

    for (const media of [
      frame,
      root.locator('[data-content-gallery] [data-content-media-layout]'),
    ]) {
      await media.evaluate((element) =>
        window.scrollBy(0, element.getBoundingClientRect().top - 8),
      );
      const header = page.locator('[data-sticky-stuck]').first();
      await expect
        .poll(() =>
          header.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(
                box.left + box.width / 2,
                box.top + box.height / 2,
              ),
            );
          }),
        )
        .toBe(true);
      await header.getByRole('button').last().click();
      await expect(page.locator('dialog')).not.toBeVisible();
      await header.getByRole('button').last().click();
    }
  });
}

test('a content video in view plays through its loops without a pause', async ({
  page,
}) => {
  const frame = page
    .locator('[data-renderer] figure')
    .filter({ hasText: 'Video caption' });
  await frame.scrollIntoViewIfNeeded();
  const main = frame.locator('video[data-media-main]');
  const backdrop = frame.locator('video[data-media-backdrop-video]');
  await expect
    .poll(() => main.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  // Every pause shows a phone's controls over the video, so a loop, a stall or
  // the backdrop catching up must not cause one.
  type Watched = HTMLVideoElement & { loops: number; pauses: number };
  await main.evaluate((v: Watched) => {
    let last = v.currentTime;
    v.loops = v.pauses = 0;
    v.addEventListener('pause', () => v.pauses++);
    v.addEventListener('timeupdate', () => {
      if (v.currentTime < last) v.loops++;
      last = v.currentTime;
    });
  });
  await expect
    .poll(() => main.evaluate((v: Watched) => v.loops), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  expect(await main.evaluate((v: Watched) => v.pauses)).toBe(0);
  expect(await main.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  expect(await backdrop.evaluate((v: HTMLVideoElement) => v.paused)).toBe(
    false,
  );
});

test('content video controls work inline; showcase videos still open a modal', async ({
  page,
  browserName,
}) => {
  const root = page.locator('[data-renderer]');
  const frame = root.locator('figure').filter({ hasText: 'Video caption' });
  await frame.scrollIntoViewIfNeeded();
  const video = frame.locator('video[data-media-main]');
  await expect(video).toHaveAttribute('controls', '');
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThan(1);
  expect(await frame.locator('button').count()).toBe(0);
  await expect(video).toHaveCSS('opacity', '1');
  // The fixture qualifies for autoplay; start paused before testing its play control.
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  await video.hover();
  const box = await video.boundingBox();
  // Chromium puts play above its seek bar; Firefox keeps both on the bottom row.
  await video.click({
    position: {
      x: 22,
      y: box!.height - (browserName === 'chromium' ? 48 : 20),
    },
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(false);
  await expect(page.locator('dialog')).not.toBeVisible();
  await video.evaluate((element: HTMLVideoElement) => {
    element.pause();
    element.currentTime = 0.5;
  });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentTime),
    )
    .toBeGreaterThanOrEqual(0.5);

  const gallery = root.locator('[data-content-gallery]');
  await gallery.locator('[role="button"]').nth(1).click();
  await expect(gallery.locator('video[controls]')).toBeVisible();
  await expect(gallery.locator('[data-gallery-view]')).toHaveCount(1);
  expect(await gallery.locator('figure button').count()).toBe(0);
  await gallery.getByText('Gallery video', { exact: true }).click();
  await expect(page.locator('dialog')).not.toBeVisible();

  await page
    .locator('[data-showcase]')
    .getByRole('button', { name: 'Showcase video' })
    .click();
  await expect(page.locator('dialog video')).toBeVisible();
  await expect(
    page.locator('dialog').getByText('Showcase video', { exact: true }),
  ).toHaveCount(1);
  await close(page);
  await page
    .locator('[data-default-gallery]')
    .getByRole('button', { name: 'Showcase video' })
    .click();
  await expect(
    page.locator('[data-default-gallery] video[controls]'),
  ).toBeVisible();
});

test('modal labels use captions and preserve file descriptions', async ({
  page,
}) => {
  const root = page.locator('[data-renderer]');
  for (const title of ['Gallery caption', 'Nested caption']) {
    await root.getByRole('button', { name: title, exact: true }).click();
    await expect(
      page.locator('dialog').getByText(title, { exact: true }),
    ).toHaveCount(1);
    await close(page);
  }
  await root.locator('[data-content-media-layout="stretch"] button').click();
  const header = page.locator('dialog .tracking-tight').first();
  await expect(header).not.toHaveText('');
  await close(page);
  // A file with nothing to show is downloaded rather than opened, and says
  // what it is on its own card.
  const document = root.getByRole('link', {
    name: 'Document title Document description',
  });
  await expect(document).toHaveAttribute('download', '');
  await expect(document).not.toHaveAttribute('target', /.+/);
  const listed = page.locator('[data-files]').getByRole('button');
  await listed.click();
  await expect(page.locator('dialog')).toContainText('Listed file');
  await expect(page.locator('dialog')).toContainText('Listed description');
  await close(page);
});

test('secret media and files keep their place but cannot be opened', async ({
  page,
}) => {
  const secrets = page.locator('[data-secrets]');
  const items = secrets.locator('[data-public-secret]');
  await expect(items).toHaveCount(3);
  for (const item of await items.all()) {
    await expect(item).not.toHaveAttribute('role', /button|link/);
    expect(await item.locator('a, button').count()).toBe(0);
    await item.click();
    await expect(page.locator('dialog')).not.toBeVisible();
  }
  await expect(secrets.getByText('Secret file Delta')).toHaveClass(/italic/);
  // The default gallery shows the first item that can actually be viewed.
  await expect(
    secrets.getByRole('button', { pressed: true }).first(),
  ).toHaveAttribute('aria-label', /Showcase/);
});

test('admin and public CTA share all color modes and the standard fallback', async ({
  page,
}) => {
  for (const row of await page.locator('[data-action]').all()) {
    const colors = await row
      .locator('.project-action-button')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const css = getComputedStyle(button);
          return [
            css.backgroundImage,
            css.backgroundColor,
            css.borderColor,
            css.getPropertyValue('--action-color'),
          ];
        }),
      );
    expect(colors[0]).toEqual(colors[1]);
  }
  const background = (mode: string) =>
    page
      .locator(`[data-action="${mode}"] .project-action-button`)
      .first()
      .evaluate((button) => getComputedStyle(button).backgroundImage);
  expect(await background('missing-color')).toBe(
    await background('standard-gradient'),
  );
});

test('a CTA shadows only its built-in glyph, never an image icon', async ({
  page,
}) => {
  const filters = (mode: string, selector: string) =>
    page
      .locator(`[data-action="${mode}"] .project-action-button ${selector}`)
      .evaluateAll((icons) =>
        icons.map((icon) => getComputedStyle(icon).filter),
      );
  // Preview and public button alike.
  expect(await filters('standard-gradient', '.media-surface')).toEqual([
    'none',
    'none',
  ]);
  const glyphs = await filters('missing-color', '.action-glyph');
  expect(glyphs).toHaveLength(2);
  for (const filter of glyphs) expect(filter).toContain('drop-shadow');
});

test('media hydration, gallery selection and snapshot restore do not flash dirty state', async ({
  page,
}) => {
  const editor = page.locator('[data-editor]');
  const state = editor.locator('[data-ready]');
  releaseSlowImages();
  await editor.locator('[data-content-gallery]').scrollIntoViewIfNeeded();
  await expect(
    editor.locator('[data-media-final-state="visible"]').first(),
  ).toBeVisible();
  await expect(state).toHaveAttribute('data-transitions', '');
  await editor.locator('[data-content-gallery] [role="button"]').nth(1).click();
  await expect(
    editor.locator('[data-content-gallery] [contenteditable="true"]'),
  ).toContainText('second');
  await expect(state).toHaveAttribute('data-snapshot-pending', 'false');
  await expect(editor.locator('[data-save]')).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
  await editor.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(state).toHaveAttribute('data-snapshot-pending', 'false');
  await expect(editor.locator('[data-save]')).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
});

test('a gallery caption stays with its tile, and typing it back undoes it', async ({
  page,
}) => {
  const editor = page.locator('[data-editor]');
  const gallery = editor.locator('[data-content-gallery]');
  const caption = gallery.locator('[contenteditable="true"]');
  const tiles = gallery.locator('[role="button"]');
  releaseSlowImages();
  await gallery.scrollIntoViewIfNeeded();

  await caption.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await tiles.nth(1).click();
  await expect(caption).toHaveText('second');
  await tiles.nth(0).click();
  await expect(caption).toHaveText('first edited');
  await expect(editor.locator('[data-save]')).toHaveText('Save');

  // The caption ends as it began, so the block is as saved again.
  await caption.click();
  await page.keyboard.press('End');
  for (let i = 0; i < ' edited'.length; i++)
    await page.keyboard.press('Backspace');
  await tiles.nth(1).click();
  await tiles.nth(0).click();
  await expect(caption).toHaveText('first');
  await expect(editor.locator('[data-save]')).toHaveText('Saved');
});

test('gallery tiles reordered twice keep their order and captions', async ({
  page,
}) => {
  const editor = page.locator('[data-editor]');
  const gallery = editor.locator('[data-content-gallery]');
  const caption = gallery.locator('[contenteditable="true"]');
  const tiles = gallery.locator('[data-drag-id]');
  const save = editor.locator('[data-save]');
  releaseSlowImages();
  await gallery.scrollIntoViewIfNeeded();

  // Sortable follows the pointer in steps; a single jump is not a drag. The
  // hover waits for the page to stop scrolling the tile into view.
  async function moveSecondToFront() {
    await tiles.nth(1).hover();
    const from = (await tiles.nth(1).boundingBox())!;
    const to = (await tiles.nth(0).boundingBox())!;
    const y = from.y + from.height / 2;
    await page.mouse.move(from.x + from.width / 2, y);
    await page.mouse.down();
    for (let step = 1; step <= 20; step++) {
      const x = from.x + from.width / 2 + ((to.x - from.x) * step) / 20;
      await page.mouse.move(x - step / 2, y);
    }
    await page.mouse.up();
  }

  await moveSecondToFront();
  await expect(tiles.first()).toHaveAttribute('data-drag-id', 'second');
  await expect(save).toHaveText('Save');
  // Back as they were: the second move counts from the first one's order.
  await moveSecondToFront();
  await expect(tiles.first()).toHaveAttribute('data-drag-id', 'first');
  await expect(save).toHaveText('Saved');

  await caption.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' typed');
  await moveSecondToFront();
  await expect(tiles.first()).toHaveAttribute('data-drag-id', 'second');
  // A click right after a drop is taken for the end of the drag.
  await expect(async () => {
    await gallery.locator('[data-drag-id="second"]').click();
    await expect(caption).toHaveText('second', { timeout: 500 });
  }).toPass();
  await gallery.locator('[data-drag-id="first"]').click();
  await expect(caption).toHaveText('first typed');
});

test('gallery switches to a slow picture at once, in a frame of its size', async ({
  page,
}) => {
  const gallery = page.locator('[data-renderer] [data-content-gallery]');
  const view = gallery.locator('[data-gallery-view]');
  await expect(view).toContainText('Gallery caption');

  // The picture is still held back, and the tile shows it anyway: the frame
  // already has its proportions, so nothing moves once it arrives.
  await gallery.locator('[role="button"]').nth(2).click();
  await expect(view).toHaveCount(1);
  await expect(view).toContainText('Slow gallery');
  await expect(view).not.toContainText('Gallery caption');
  const frame = view.locator('[data-content-media-layout]');
  const height = (await frame.boundingBox())?.height;
  releaseSlowImages();
  await expect(
    view.locator('[data-media-final-state="visible"]'),
  ).toBeVisible();
  expect((await frame.boundingBox())?.height).toBe(height);

  const publicGallery = page.locator('[data-default-gallery]');
  const publicView = publicGallery.locator('[data-gallery-view]');
  await publicGallery
    .getByRole('button', { name: 'Showcase slow-image' })
    .click();
  await expect(publicView).toHaveCount(1);
  await expect(publicView).toContainText('Showcase slow-image');
});
