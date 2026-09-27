import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * A picture for a person to look at, not something a test checks: taken only
 * with `E2E_SCREENSHOTS=1`, into `.artifacts/screenshots/`, once every
 * finite animation on the page has come to rest.
 */
export async function screenshot(page: Page, name: string) {
  if (!process.env.E2E_SCREENSHOTS) return;
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  await page.screenshot({
    path: fileURLToPath(
      new URL(`./.artifacts/screenshots/${name}.png`, import.meta.url),
    ),
  });
}
