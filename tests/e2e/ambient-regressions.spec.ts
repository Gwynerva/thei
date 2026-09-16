import { expect, test, type Page } from '@playwright/test';

let releaseAmbientSlow: () => void;

async function images(page: Page) {
  const slowGate = new Promise<void>((resolve) => {
    releaseAmbientSlow = resolve;
  });
  await page.route('**/ambient-*.svg', async (route) => {
    const name = route
      .request()
      .url()
      .match(/ambient-([\w-]+)\.svg/)?.[1];
    if (name === 'error') return route.fulfill({ status: 404, body: '' });
    if (name === 'slow') await slowGate;
    const [width, height] =
      name === 'portrait'
        ? [180, 480]
        : name === 'square' || name === 'transparent'
          ? [240, 240]
          : [640, 180];
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="${name === 'transparent' ? 'none' : '#459271'}" stroke="white" stroke-width="4"/><circle cx="${width / 2}" cy="${height / 2}" r="50" fill="#7daff4"/><text x="10" y="22" fill="white">TOP</text><text x="10" y="${height - 12}" fill="white">BOTTOM</text></svg>`,
    });
  });
}

/** Edge media spans the whole strip height and is pinned to its edge. */
async function expectEdgeMedia(
  surface: ReturnType<Page['locator']>,
  side: 'left' | 'right',
) {
  const main = surface.locator('[data-media-main]');
  await expect(main).toHaveCSS('object-fit', 'cover');
  const box = (await surface.boundingBox())!;
  const mainBox = (await main.boundingBox())!;
  expect(mainBox.height).toBeCloseTo(box.height, 0);
  expect(mainBox.y).toBeCloseTo(box.y, 0);
  if (side === 'left') expect(mainBox.x).toBeCloseTo(box.x, 0);
  else expect(mainBox.x + mainBox.width).toBeCloseTo(box.x + box.width, 0);
}

test.beforeEach(async ({ page }) => {
  await images(page);
});

for (const width of [390, 1280]) {
  test(`hero contains every image shape and cards share layers at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const shape of [
      'wide',
      'portrait',
      'square',
      'transparent',
      'unknown',
    ]) {
      await page.goto(`/ambient-regression?banner=${shape}`);
      const hero = page.locator('[data-test-hero]');
      const banner = hero.locator('.hero-banner');
      await expect(banner).toHaveAttribute('data-media-final-state', 'visible');
      const box = await banner.boundingBox();
      if (width === 390)
        expect(box!.width / box!.height).toBeCloseTo(16 / 9, 2);
      const foreground = banner.locator('[data-media-main]');
      await expect(foreground).toHaveCSS('object-fit', 'contain');
      const mainBox = await foreground.boundingBox();
      expect(mainBox!.y).toBeGreaterThanOrEqual(box!.y);
      expect(mainBox!.y + mainBox!.height).toBeLessThanOrEqual(
        box!.y + box!.height + 1,
      );
      if (width === 1280) {
        const paintedHeight = await foreground.evaluate(
          (element: HTMLImageElement) => {
            const rect = element.getBoundingClientRect();
            return (
              Math.min(
                rect.width / element.naturalWidth,
                rect.height / element.naturalHeight,
              ) * element.naturalHeight
            );
          },
        );
        expect(paintedHeight).toBeCloseTo(box!.height, 1);
      }
      await expect(
        banner.locator('[data-media-original-pair] img.media-backdrop'),
      ).toHaveCSS('object-fit', 'cover');
      if (width === 1280) {
        const background = await banner
          .locator('[data-media-original-pair] .media-backdrop')
          .boundingBox();
        expect(background!.x + background!.width / 2).toBeCloseTo(
          mainBox!.x + mainBox!.width / 2,
          1,
        );
        expect(background!.y + background!.height / 2).toBeCloseTo(
          mainBox!.y + mainBox!.height / 2,
          1,
        );
        expect(background!.width / background!.height).toBeCloseTo(
          mainBox!.width / mainBox!.height,
          2,
        );
        expect(background!.x).toBeLessThanOrEqual(box!.x);
        expect(background!.x + background!.width).toBeGreaterThanOrEqual(
          box!.x + box!.width,
        );
        expect(background!.y).toBeLessThanOrEqual(box!.y);
        expect(background!.y + background!.height).toBeGreaterThanOrEqual(
          box!.y + box!.height,
        );
      }
      const tags = hero.locator('[data-hero-tags]');
      await expect(tags.locator('a')).toHaveText(['Tag 1', 'Tag 2', 'Tag 3']);
      expect((await tags.boundingBox())!.y).toBeGreaterThan(
        (await hero
          .getByRole('button', { name: 'Showcase image' })
          .boundingBox())!.y,
      );
      const icon = hero.locator('[data-hero-icon]');
      await expect(icon).toHaveCSS('border-radius', '0px');
      await expect(icon).toHaveCSS('box-shadow', 'none');
      await expect(icon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(
        page.locator('[data-cards] [data-media-variant="ambient"]'),
      ).toHaveCount(3);
      for (const [index, card] of (
        await page.locator('[data-cards] [data-media-variant="ambient"]').all()
      ).entries()) {
        await card.scrollIntoViewIfNeeded();
        await expect(card).toHaveAttribute('data-media-final-state', 'visible');
        await expectEdgeMedia(card, index === 1 ? 'left' : 'right');
        for (const layer of await card
          .locator('[data-media-foreground] > img')
          .all()) {
          await expect(layer).toHaveCSS(
            'object-position',
            index === 1 ? '0% 50%' : '100% 50%',
          );
          await expect(layer).toHaveCSS(
            'mask-image',
            index === 1 ? /to right/ : /to left/,
          );
          await expect(layer).toHaveCSS(
            'mask-position',
            index === 1 ? '0% 50%' : '100% 50%',
          );
          await expect(layer).toHaveCSS('mask-repeat', 'no-repeat');
        }
        await expect(
          card.locator('[data-media-original-pair] img.media-backdrop'),
        ).toHaveCSS('object-fit', 'cover');
      }
      const tall = page.locator(
        '[data-tall-card] [data-media-variant="ambient"]',
      );
      await tall.scrollIntoViewIfNeeded();
      await expect(tall).toHaveAttribute('data-media-final-state', 'visible');
      await expectEdgeMedia(tall, 'right');
      if (shape === 'portrait') {
        await hero.scrollIntoViewIfNeeded();
        await expect(banner).toHaveAttribute(
          'data-media-final-state',
          'visible',
        );
        await page.screenshot({
          path: `tests/e2e/.artifacts/ambient-${width}.png`,
        });
      }
    }
  });

  test(`hero without banner shades its full bounds and handles tag counts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [0, 1, 3, 5]) {
      await page.goto(`/ambient-regression?banner=none&tags=${count}`);
      const hero = page.locator('[data-test-hero]');
      expect(await hero.locator('.hero-banner').count()).toBe(0);
      expect(await hero.locator('[data-hero-tags] a').count()).toBe(
        Math.min(count, 3),
      );
      const shade = hero.locator('[data-hero-shade]');
      await expect(shade).toBeVisible();
      await expect(shade).toHaveCSS('mask-image', 'none');
      expect(await shade.boundingBox()).toEqual(await hero.boundingBox());
      expect(
        await hero.evaluate((element) =>
          getComputedStyle(element)
            .getPropertyValue('--project-hero-accent')
            .trim(),
        ),
      ).not.toBe('');
      await expect(hero).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  });
}

test('slow video keeps the color pulse until ready, then both layers play and follow controls', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/regression-video.mp4', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/ambient-regression?banner=video');
  const banner = page.locator('.hero-banner');
  await expect(banner).toHaveAttribute('data-media-preview-state', 'visible');
  await expect(banner.locator('[data-media-loading]')).toBeVisible();
  await expect(banner).toHaveAttribute('data-media-final-state', 'loading');
  await expect(banner.locator('[data-media-preview-pair]')).toHaveCSS(
    'opacity',
    '0',
  );
  await expect(banner.locator('[data-media-original-pair]')).toHaveCSS(
    'opacity',
    '0',
  );
  release();
  const main = banner.locator('video[data-media-main]');
  const backdrop = banner.locator('video[data-media-backdrop-video]');
  await expect(banner).toHaveAttribute('data-media-final-state', 'visible');
  await expect(banner.locator('[data-media-loading]')).toHaveCSS(
    'opacity',
    '0',
  );
  await expect
    .poll(() => main.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    await backdrop.evaluate((v: HTMLVideoElement) => v.muted && !v.controls),
  ).toBe(true);
  await main.evaluate(async (v: HTMLVideoElement) => {
    if (!v.paused) {
      await new Promise<void>((resolve) => {
        v.addEventListener('pause', () => resolve(), { once: true });
        v.pause();
      });
    }
    v.currentTime = 0.5;
    v.playbackRate = 0.5;
  });
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(0.5, 1);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.playbackRate))
    .toBe(0.5);
  await main.evaluate(async (v: HTMLVideoElement) => {
    v.currentTime = v.duration - 0.1;
    v.playbackRate = 1;
    try {
      await v.play();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        throw error;
      }
    }
  });
  await expect
    .poll(() => main.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeLessThan(0.5);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await page.locator('[data-below]').scrollIntoViewIfNeeded();
  await expect(banner).toHaveAttribute('data-media-active', 'false');
  await expect(banner.locator('video')).toHaveCount(0);
  await banner.scrollIntoViewIfNeeded();
  await expect
    .poll(() => main.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await main.evaluate(async (v: HTMLVideoElement) => {
    if (!v.paused) {
      await new Promise<void>((resolve) => {
        v.addEventListener('pause', () => resolve(), { once: true });
        v.pause();
      });
    }
    v.currentTime = 0.5;
  });
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(0.5, 1);
  await page.locator('[data-below]').scrollIntoViewIfNeeded();
  await expect(banner).toHaveAttribute('data-media-active', 'false');
  await banner.scrollIntoViewIfNeeded();
  await expect(banner).toHaveAttribute('data-media-final-state', 'visible');
  expect(await main.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect
    .poll(() => main.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(0.5, 1);
  await page.locator('[data-switch-preview]').click();
  await expect(banner).toHaveAttribute('data-media-preview-state', 'idle');
  await expect(banner).toHaveAttribute('data-media-final-state', 'visible');
  await expect
    .poll(() => main.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await expect
    .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
});

test('preview failures, final failures and source changes recover without stale loading', async ({
  page,
}) => {
  for (const scenario of ['missing-preview', 'error', 'no-preview']) {
    await page.goto(`/ambient-regression?banner=${scenario}`);
    const banner = page.locator('.hero-banner');
    await expect(banner).toHaveAttribute(
      'data-media-final-state',
      scenario === 'error' ? 'error' : 'visible',
    );
    await expect(banner.locator('[data-media-loading]')).toHaveCSS(
      'opacity',
      '0',
    );
    if (scenario === 'error')
      await expect(banner.locator('[data-media-preview-pair]')).toHaveCSS(
        'opacity',
        '1',
      );
  }
  await page.goto('/ambient-regression?banner=slow');
  const banner = page.locator('.hero-banner');
  await expect(banner).toHaveAttribute('data-media-final-state', 'loading');
  await page.locator('[data-switch-source]').click();
  await expect(banner).toHaveAttribute('data-media-final-state', 'visible');
  await expect(banner.locator('[data-media-main]')).toHaveAttribute(
    'src',
    '/ambient-portrait.svg',
  );
  await expect(
    banner.locator('[data-media-original-pair] img.media-backdrop'),
  ).toHaveAttribute('src', '/ambient-portrait.svg');
  releaseAmbientSlow();
});

test('reduced motion disables ambient playback and pulse; background failure leaves the main video working', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ambient-regression?banner=slow');
  const banner = page.locator('.hero-banner');
  await expect(banner.locator('[data-media-loading] > span')).toHaveCSS(
    'animation-name',
    'none',
  );
  releaseAmbientSlow();
  await page.goto('/ambient-regression?banner=video');
  await expect(banner).toHaveAttribute('data-media-final-state', 'visible');
  const main = banner.locator('video[data-media-main]');
  expect(await main.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(() => main.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await banner
    .locator('video[data-media-backdrop-video]')
    .dispatchEvent('error');
  await expect(banner.locator('video[data-media-backdrop-video]')).toHaveCount(
    0,
  );
  expect(await main.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(
    banner.locator('[data-media-preview-pair] img.media-backdrop'),
  ).toBeVisible();
});

test('a delayed backdrop decode holds the entire pair, including with a cached foreground', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as unknown as { releaseBackdrop: () => void }).releaseBackdrop =
      release;
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      if (
        this.closest('.hero-banner [data-media-original-pair]') &&
        this.classList.contains('media-backdrop')
      )
        await gate;
    };
  });
  await page.goto('/ambient-regression?banner=wide');
  const banner = page.locator('.hero-banner');
  await expect(banner.locator('[data-media-main]')).toHaveJSProperty(
    'complete',
    true,
  );
  await expect(banner.locator('[data-media-loading]')).toBeVisible();
  await expect(banner.locator('[data-media-original-pair]')).toHaveCSS(
    'opacity',
    '0',
  );
  await expect(banner.locator('[data-media-loading]')).toHaveCSS(
    'opacity',
    '1',
  );
  const samples = await page.evaluate(async () => {
    (window as unknown as { releaseBackdrop: () => void }).releaseBackdrop();
    const root = document.querySelector('.hero-banner')!;
    const started = performance.now();
    const samples: { loading: number; original: number }[] = [];
    await new Promise<void>((resolve) => {
      const sample = () => {
        samples.push({
          loading: Number(
            getComputedStyle(root.querySelector('[data-media-loading]')!)
              .opacity,
          ),
          original: Number(
            getComputedStyle(root.querySelector('[data-media-original-pair]')!)
              .opacity,
          ),
        });
        if (performance.now() - started < 700) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return samples;
  });
  expect(
    samples.some(
      (value) =>
        value.loading > 0 &&
        value.loading < 1 &&
        value.original > 0 &&
        value.original < 1,
    ),
  ).toBe(true);
  expect(samples.at(-1)).toEqual({ loading: 0, original: 1 });
  await expect(banner).toHaveAttribute('data-media-final-state', 'visible');
  await expect(banner.locator('[data-media-original-pair]')).toHaveCSS(
    'opacity',
    '1',
  );
  expect(
    await banner
      .locator('[data-media-main]')
      .evaluate(
        (element) =>
          element.closest('[data-media-original-pair]') ===
          element
            .closest('.hero-banner')
            ?.querySelector('[data-media-original-pair] .media-backdrop')
            ?.parentElement,
      ),
  ).toBe(true);
});

for (const width of [390, 1280]) {
  test(`FieldContentEditor fills the height with a proportional wide foreground at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ambient-regression?banner=wide');
    await expect(page.locator('[data-test-hero] .hero-banner')).toHaveAttribute(
      'data-media-final-state',
      'visible',
    );
    const field = page.locator('[data-test-field]');
    await field.hover();
    const media = field.locator('[data-media-main]');
    await expect(field.locator('[data-media-final-state]')).toHaveAttribute(
      'data-media-final-state',
      'visible',
    );
    const box = await media.boundingBox();
    const frame = await field.locator('.media-edge-strip').boundingBox();
    expect(box!.height).toBeCloseTo(frame!.height, 1);
    expect(box!.width / box!.height).toBeCloseTo(640 / 180, 2);
    expect(box!.x).toBeCloseTo(frame!.x, 1);
    expect(box!.width).toBeGreaterThan(frame!.width);
  });
}

test('admin previews play only while hovered or focused, including nested focus', async ({
  page,
}) => {
  await page.goto('/ambient-regression?banner=video');
  await expect(page.locator('[data-test-hero] .hero-banner')).toHaveAttribute(
    'data-media-final-state',
    'visible',
  );
  for (const selector of [
    '[data-test-field]',
    '[data-test-tile]',
    '[data-test-editor-link]',
  ]) {
    const tile = page.locator(selector);
    await tile.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const surface = tile.locator('[data-media-final-state]');
    await expect(surface).toHaveAttribute(
      'data-media-preview-state',
      'visible',
    );
    await expect(tile.locator('video')).toHaveCount(0);
    await tile.hover();
    const main = tile.locator('video[data-media-main]');
    const backdrop = tile.locator('video[data-media-backdrop-video]');
    await expect
      .poll(() => main.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(false);
    await expect
      .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(false);
    await tile.focus();
    await page.mouse.move(0, 0);
    expect(await main.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    if (selector === '[data-test-tile]') {
      await tile.locator('[data-test-nested]').focus();
      expect(await main.evaluate((v: HTMLVideoElement) => v.paused)).toBe(
        false,
      );
    }
    await page.locator('[data-clear-focus]').focus();
    await expect
      .poll(() => main.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
    await expect
      .poll(() => backdrop.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
  }
});
