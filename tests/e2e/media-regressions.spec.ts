import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*regression-image.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    }),
  );
  await page.route('**/slow-image.svg', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      contentType: 'image/svg+xml',
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
    await expect(page.locator('dialog')).toContainText('original-image');
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

test('content video controls work inline; showcase videos still open a modal', async ({
  page,
}) => {
  const root = page.locator('[data-renderer]');
  const frame = root.locator('figure').filter({ hasText: 'Video caption' });
  await frame.scrollIntoViewIfNeeded();
  const video = frame.locator('video');
  await expect(video).toHaveAttribute('controls', '');
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThan(1);
  expect(await frame.locator('button').count()).toBe(0);
  const box = await video.boundingBox();
  await page.mouse.click(box!.x + 22, box!.y + box!.height - 20);
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

test('modal labels use captions, preserve file descriptions and never substitute filenames', async ({
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
  await expect(header).not.toContainText('original-image');
  await expect(header).not.toHaveText('');
  await close(page);
  for (const [locator, title, description] of [
    [
      root.getByRole('button', { name: 'Document title Document description' }),
      'Document title',
      'Document description',
    ],
    [
      page.locator('[data-files]').getByRole('button'),
      'Listed file',
      'Listed description',
    ],
  ] as const) {
    await locator.click();
    await expect(page.locator('dialog')).toContainText(title);
    await expect(page.locator('dialog')).toContainText(description);
    await expect(page.locator('dialog')).toContainText('original-image');
    await close(page);
  }
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
            css.getPropertyValue('--action-highlight'),
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

test('media hydration, gallery selection and snapshot restore do not flash dirty state', async ({
  page,
}) => {
  const editor = page.locator('[data-editor]');
  const state = editor.locator('[data-ready]');
  await editor.locator('[data-content-gallery]').scrollIntoViewIfNeeded();
  await expect(
    editor.locator('[data-media-final-state="visible"]').first(),
  ).toBeVisible();
  await expect(state).toHaveAttribute('data-transitions', '');
  await editor.locator('[data-content-gallery] [role="button"]').nth(1).click();
  await expect(
    editor.locator('[data-content-gallery] [contenteditable="true"]'),
  ).toContainText('second');
  await page.waitForTimeout(1200);
  await expect(editor.locator('[data-save]')).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
  await editor.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.waitForTimeout(1200);
  await expect(editor.locator('[data-save]')).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
});
