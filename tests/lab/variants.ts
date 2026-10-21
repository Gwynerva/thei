// How the lab opens Thei in a browser, in one place for the plays, the probe
// and its own tests: the four variants (a computer or a phone, light or
// dark), the screen of each, the visitor's own setting of the theme, and
// when a page stands still enough to be photographed and measured.
import type { Page } from '@playwright/test';
import type { Theme, Variant, VariantCode, Viewport } from './types';

/** A viewport and a theme, written short. */
export const VARIANTS: Record<VariantCode, Variant> = {
  dd: { viewport: 'desktop', theme: 'dark' },
  dl: { viewport: 'desktop', theme: 'light' },
  pd: { viewport: 'phone', theme: 'dark' },
  pl: { viewport: 'phone', theme: 'light' },
};

export function variantCode(variant: Variant): VariantCode {
  return `${variant.viewport[0]}${variant.theme[0]}` as VariantCode;
}

/** The screens every part of the lab plays on, as a browser context takes them. */
export const VIEWPORTS = {
  desktop: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  phone: {
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
} as const satisfies Record<Viewport, object>;

/**
 * What a page reads before it loads, so it opens in the variant's theme:
 * the visitor's own setting (`app/scripts/visuals.ts`), with a pinned accent
 * and font so that shots stay comparable.
 */
export function visualsScript(theme: Theme) {
  return `try { localStorage.setItem('thei-visuals', ${JSON.stringify(
    JSON.stringify({ theme, accentHue: 200, fontStyle: 'sans' }),
  )}); } catch {}`;
}

export interface SettleOptions {
  /**
   * A pause first: a field that searches as one types waits a moment
   * before it asks, and the network is quiet until then.
   */
  pauseMs?: number;
  /** How long to wait for the network to fall quiet; none when absent. */
  networkIdleMs?: number;
  /** How long the page may take to stand still once loaded. */
  timeoutMs?: number;
}

/**
 * Waits for what a person waits for: fonts loaded, finite animations and
 * transitions over, nothing `aria-busy`, two frames drawn. Infinite
 * animations — a spinner — are not waited for. Returns the time it took.
 */
export async function settle(
  page: Page,
  options: SettleOptions = {},
): Promise<number> {
  const started = performance.now();
  if (options.pauseMs) await page.waitForTimeout(options.pauseMs);
  if (options.networkIdleMs)
    await page
      .waitForLoadState('networkidle', { timeout: options.networkIdleMs })
      .catch(() => {});
  await page
    .evaluate(async (timeout) => {
      const end = performance.now() + timeout;
      const left = () => Math.max(0, end - performance.now());
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
      await Promise.race([document.fonts.ready, sleep(left())]);
      for (let pass = 0; pass < 3 && left() > 0; pass++) {
        const finite = document.getAnimations().filter((animation) => {
          if (animation.playState !== 'running' && !animation.pending)
            return false;
          const timing = animation.effect?.getComputedTiming();
          return !!timing && Number.isFinite(Number(timing.endTime));
        });
        if (!finite.length) break;
        await Promise.race([
          Promise.allSettled(finite.map((animation) => animation.finished)),
          sleep(left()),
        ]);
      }
      while (document.querySelector('[aria-busy="true"]') && left() > 0)
        await sleep(50);
      const frame = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
          setTimeout(resolve, 100);
        });
      await frame();
      await frame();
    }, options.timeoutMs ?? 3000)
    // A page that navigates while it is watched has stood still enough.
    .catch(() => {});
  return performance.now() - started;
}

/**
 * A reader's recent searches as a browser keeps them for the quick search,
 * as its `localStorage` entry. The key is `searchHistoryKey` of
 * `app/composables/search-history.ts`, written out here because the app's
 * module does not load outside Nuxt; `variants.test.ts` holds them together.
 */
export function searchHistoryEntry(
  reader: 'owner' | 'visitor',
  queries: readonly string[],
  base = '/',
) {
  return {
    name: `thei:search-history:v1:${base}:${reader}`,
    value: JSON.stringify(queries),
  };
}
