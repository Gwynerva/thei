import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * When hints show (`app/composables/press-hint.ts`), on the fixture's page of
 * every kind of anchor. A finger: a tap acts, the first long press shows the
 * hint and keeps the click and the system menu back, the second long press
 * is the system's; a tap shows the hint of a thing with no action; a text
 * field gets none. A mouse: a pause shows it, a press hides it. The keyboard:
 * moving the focus shows it, Escape takes it away first.
 */

const PAGE = '/press-hint-regression';

async function open(page: Page) {
  await page.goto(PAGE);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const hint = (page: Page) => page.locator('[data-title-popup-el]');
const card = (page: Page) => page.locator('[data-test-card]');

async function centre(target: Locator) {
  const box = (await target.boundingBox())!;
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

/**
 * A finger held still on `target` for `ms`, `during` run before it lifts.
 * Real touches through CDP, so the browser makes of them what it would of a
 * finger: pointer events, its own long press, the click on release.
 */
async function hold(
  page: Page,
  target: Locator,
  ms: number,
  during?: () => Promise<void>,
) {
  const { x, y } = await centre(target);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(ms);
  await during?.();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
}

/**
 * Whether a menu asked for on `target` now would be held back. Sent only
 * once a hint is up or the press is the system's: the system's own request
 * is what a press listens to, and a made-up one while the finger is still
 * deciding would be taken for it.
 */
function menuHeldBack(target: Locator) {
  return target.evaluate(
    (element) =>
      !element.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      ),
  );
}

function selectionHeldBack(target: Locator) {
  return target.evaluate(
    (element) =>
      !element.dispatchEvent(
        new Event('selectstart', { bubbles: true, cancelable: true }),
      ),
  );
}

async function expectAbove(page: Page, anchor: Locator) {
  const popup = (await hint(page).boundingBox())!;
  const box = (await anchor.boundingBox())!;
  expect(popup.y + popup.height).toBeLessThanOrEqual(box.y + 1);
}

test.describe('by touch', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(
      true,
    );
  });

  test('a tap on a control acts and shows nothing', async ({ page }) => {
    const button = page.locator('[data-test-menu-button]');
    await button.tap();
    await expect(button).toHaveAttribute('data-clicks', '1');
    await expect(page.locator('[data-test-menu]')).toBeVisible();
    await page.waitForTimeout(700);
    await expect(hint(page)).toBeHidden();
  });

  test('the first long press shows the hint above and keeps the click back; the second is the system’s', async ({
    page,
  }) => {
    const button = page.locator('[data-test-menu-button]');
    await expect(button).toHaveCSS('user-select', 'none');
    await hold(page, button, 900, async () => {
      await expect(hint(page)).toHaveText('Menu hint');
      await expectAbove(page, button);
      expect(await menuHeldBack(button)).toBe(true);
      expect(await selectionHeldBack(button)).toBe(true);
    });
    await page.waitForTimeout(300);
    await expect(button).toHaveAttribute('data-clicks', '0');
    await expect(page.locator('[data-test-menu]')).toBeHidden();
    await expect(hint(page)).toBeVisible();
    // With the hint up, the system may have the press again.
    await expect(button).toHaveAttribute('data-title-popup-open', '');
    await expect(button).not.toHaveCSS('user-select', 'none');

    await hold(page, button, 900, async () => {
      expect(await selectionHeldBack(button)).toBe(false);
      expect(await menuHeldBack(button)).toBe(false);
    });
    // The system's menu took the hint's place.
    await expect(hint(page)).toBeHidden();
    await expect(button).not.toHaveAttribute('data-title-popup-open');
  });

  test('a tap on a control whose hint is up acts and lets the hint go', async ({
    page,
  }) => {
    const button = page.locator('[data-test-menu-button]');
    await hold(page, button, 900);
    await expect(hint(page)).toBeVisible();
    await page.waitForTimeout(800);
    await button.tap();
    await expect(button).toHaveAttribute('data-clicks', '1');
    await expect(hint(page)).toBeHidden();
  });

  test('a long press on a link does not follow it, a tap does', async ({
    page,
  }) => {
    const link = page.locator('[data-test-link]');
    await hold(page, link, 900);
    await expect(hint(page)).toHaveText('Link hint');
    await page.waitForTimeout(300);
    expect(page.url()).not.toContain('#followed');
    await page.waitForTimeout(500);
    await link.tap();
    await expect(page).toHaveURL(/#followed$/);
  });

  test('a hinted icon inside a link is the link’s to act on', async ({
    page,
  }) => {
    const icon = page.locator('[data-test-icon]');
    await hold(page, icon, 900);
    await expect(hint(page)).toHaveText('Icon hint');
    expect(page.url()).not.toContain('#card');
    await page.waitForTimeout(800);
    await icon.tap();
    await expect(page).toHaveURL(/#card$/);
  });

  test('a tap shows the hint of what has no action, and the next hides it', async ({
    page,
  }) => {
    const abbr = page.locator('[data-test-abbr]');
    await abbr.tap();
    await expect(hint(page)).toHaveText('Abbr hint');
    await expectAbove(page, abbr);
    await abbr.tap();
    await expect(hint(page)).toBeHidden();

    await abbr.tap();
    await expect(hint(page)).toBeVisible();
    await page.locator('main').tap({ position: { x: 300, y: 10 } });
    await expect(hint(page)).toBeHidden();

    // A disabled button does nothing either. Playwright taps only what is
    // enabled, so the finger goes to where it is.
    const disabled = page.locator('[data-test-disabled]');
    const { x, y } = await centre(disabled);
    await page.touchscreen.tap(x, y);
    await expect(hint(page)).toHaveText('Disabled hint');
    await expect(disabled).toHaveAttribute('data-clicks', '0');
  });

  test('a long press on text is left to the system', async ({ page }) => {
    const abbr = page.locator('[data-test-abbr]');
    await hold(page, abbr, 900, async () => {
      expect(await selectionHeldBack(abbr)).toBe(false);
      expect(await menuHeldBack(abbr)).toBe(false);
    });
    await page.waitForTimeout(300);
    await expect(hint(page)).toBeHidden();
  });

  test('a text field gets no hint and keeps its long press', async ({
    page,
  }) => {
    for (const selector of ['[data-test-input]', '[data-test-editable-abbr]']) {
      const field = page.locator(selector);
      await field.tap();
      await hold(page, field, 900, async () => {
        expect(await menuHeldBack(field)).toBe(false);
      });
      await page.waitForTimeout(300);
      await expect(hint(page)).toBeHidden();
    }
  });

  test('a press the finger drifts from, or a pinch, shows nothing', async ({
    page,
  }) => {
    const button = page.locator('[data-test-menu-button]');
    const { x, y } = await centre(button);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 5; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + step * 5, y }],
      });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(800);
    await expect(hint(page)).toBeHidden();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x, y, id: 0 },
        { x: x + 40, y: y + 40, id: 1 },
      ],
    });
    await page.waitForTimeout(900);
    await expect(hint(page)).toBeHidden();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  });

  test('a hint stays while its anchor stays, and goes when it scrolls away', async ({
    page,
  }) => {
    const abbr = page.locator('[data-test-scroll-abbr]');
    await abbr.tap();
    await expect(hint(page)).toHaveText('Scroll hint');
    await page
      .locator('[data-test-other-scroller]')
      .evaluate((element) => element.scrollBy(0, 40));
    await page.waitForTimeout(200);
    await expect(hint(page)).toBeVisible();
    await page
      .locator('[data-test-scroller]')
      .evaluate((element) => element.scrollBy(0, 40));
    await expect(hint(page)).toBeHidden();
  });

  test('a hint held on a chip goes when the chip is dragged', async ({
    page,
  }) => {
    const chip = page.locator('[data-test-chip]').first();
    const { x, y } = await centre(chip);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(900);
    await expect(hint(page)).toHaveText('Chip hint');
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + step * 15, y }],
      });
      await page.waitForTimeout(16);
    }
    await expect(hint(page)).toBeHidden();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-test-chip-clicks]')).toHaveText('0');
  });

  test('a link card opens on the first long press, a tap follows the link', async ({
    page,
  }) => {
    const link = page.locator('[data-test-card-link]');
    await hold(page, link, 900, async () => {
      await expect(card(page)).toBeVisible();
    });
    // Still there once the finger is gone.
    await page.waitForTimeout(300);
    await expect(card(page)).toHaveText('Card of Card link');
    const popup = (await card(page).boundingBox())!;
    const box = (await link.boundingBox())!;
    expect(popup.y + popup.height).toBeLessThanOrEqual(box.y + 1);
    expect(page.url()).not.toContain('#card-followed');

    await hold(page, link, 900, async () => {
      expect(await menuHeldBack(link)).toBe(false);
    });
    await expect(card(page)).toBeHidden();

    await page.waitForTimeout(800);
    await link.tap();
    await expect(page).toHaveURL(/#card-followed$/);
    await page.waitForTimeout(500);
    await expect(card(page)).toBeHidden();
  });

  test('a hint in a dialog shows in it', async ({ page }) => {
    await page.locator('[data-test-open-dialog]').tap();
    const button = page.locator('[data-test-dialog-button]');
    await hold(page, button, 900);
    await expect(
      page.locator('[data-test-dialog] [data-title-popup-el]'),
    ).toHaveText('Dialog hint');
  });

  test('a card’s date gives its day on a tap, and the rest of the card opens it', async ({
    page,
  }) => {
    const card = page.locator('[data-test-plain-date-card]');
    const date = card.locator('time');
    await date.scrollIntoViewIfNeeded();
    await date.tap();
    await expect(hint(page)).toContainText(year());
    expect(page.url()).not.toContain('opened=');
    // The title lies under the card's link, as the rest of it does.
    const title = await centre(card.locator('h3'));
    await page.touchscreen.tap(title.x, title.y);
    await expect(page).toHaveURL(/opened=card/);
  });

  test('a card’s linked date follows its link on a tap, and gives its day on a long press', async ({
    page,
  }) => {
    const date = page.locator(
      '[data-test-linked-date-card] a[href*="opened=date"]',
    );
    await date.scrollIntoViewIfNeeded();
    await hold(page, date, 900);
    await expect(hint(page)).toContainText(year());
    await page.waitForTimeout(300);
    expect(page.url()).not.toContain('opened=');
    await page.waitForTimeout(500);
    await date.tap();
    await expect(page).toHaveURL(/opened=date/);
  });
});

/** The year of the fixture cards' date, two days back. */
function year() {
  return String(new Date(Date.now() - 2 * 86_400_000).getUTCFullYear());
}

test.describe('by mouse', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('a pause shows the hint, a press hides it until the pointer leaves', async ({
    page,
  }) => {
    const button = page.locator('[data-test-menu-button]');
    await button.hover();
    await expect(hint(page)).toHaveText('Menu hint');
    const popup = (await hint(page).boundingBox())!;
    const box = (await button.boundingBox())!;
    expect(popup.y).toBeGreaterThanOrEqual(box.y + box.height - 1);

    await page.mouse.down();
    await expect(hint(page)).toBeHidden();
    await page.mouse.up();
    await expect(page.locator('[data-test-menu]')).toBeVisible();
    await page.waitForTimeout(700);
    await expect(hint(page)).toBeHidden();

    await page.mouse.move(5, 5);
    await button.hover();
    await expect(hint(page)).toHaveText('Menu hint');
  });

  test('a card’s date gives its day under the pointer, and a click beside it opens the card', async ({
    page,
  }) => {
    const card = page.locator('[data-test-plain-date-card]');
    await card.locator('time').hover();
    await expect(hint(page)).toContainText(year());
    // The title lies under the card's link, as the rest of it does.
    const title = await centre(card.locator('h3'));
    await page.mouse.click(title.x, title.y);
    await expect(page).toHaveURL(/opened=card/);
  });

  test('the innermost anchor speaks', async ({ page }) => {
    await page.locator('[data-test-icon]').hover();
    await expect(hint(page)).toHaveText('Icon hint');
  });

  test('a link card shows while the pointer rests on its link', async ({
    page,
  }) => {
    await page.locator('[data-test-card-link]').hover();
    await expect(card(page)).toBeVisible();
    const popup = (await card(page).boundingBox())!;
    const box = (await page.locator('[data-test-card-link]').boundingBox())!;
    expect(popup.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
    await page.mouse.move(5, 5);
    await expect(card(page)).toBeHidden();
  });
});

test.describe('by keyboard', () => {
  test.beforeEach(async ({ page }) => open(page));

  async function tabTo(page: Page, target: Locator) {
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press('Tab');
      if (
        await target.evaluate((element) => element === document.activeElement)
      )
        return;
    }
    throw new Error('never reached by Tab');
  }

  test('moving the focus shows the hint, Escape takes it away', async ({
    page,
  }) => {
    const button = page.locator('[data-test-menu-button]');
    await tabTo(page, button);
    await expect(hint(page)).toHaveText('Menu hint');
    await page.keyboard.press('Escape');
    await expect(hint(page)).toBeHidden();
    await expect(button).toBeFocused();
    await page.waitForTimeout(600);
    await expect(hint(page)).toBeHidden();
  });

  test('a focus moved by a script brings no hint', async ({ page }) => {
    await page.locator('[data-test-menu-button]').focus();
    await page.waitForTimeout(700);
    await expect(hint(page)).toBeHidden();
  });

  test('a control used from the keyboard opens its menu without the hint', async ({
    page,
  }) => {
    const button = page.locator('[data-test-menu-button]');
    await tabTo(page, button);
    await expect(hint(page)).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-test-menu]')).toBeVisible();
    await expect(hint(page)).toBeHidden();
    await page.waitForTimeout(700);
    await expect(hint(page)).toBeHidden();
  });

  test('in a dialog, the first Escape is the hint’s and the second the dialog’s', async ({
    page,
  }) => {
    const opener = page.locator('[data-test-open-dialog]');
    await tabTo(page, opener);
    await page.keyboard.press('Enter');
    const dialog = page.locator('[data-test-dialog]');
    await expect(dialog).toBeVisible();
    await tabTo(page, page.locator('[data-test-dialog-button]'));
    await expect(
      page.locator('[data-test-dialog] [data-title-popup-el]'),
    ).toHaveText('Dialog hint');
    await page.keyboard.press('Escape');
    await expect(hint(page)).toBeHidden();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
