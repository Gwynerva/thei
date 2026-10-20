// The layout probe, from outside the page: wait for the page to stand
// still, measure it (`in-page.ts`), set aside what `allow.ts` lets be.
// Used after every recorded step of a play and on every screen of a sweep;
// what it finds are suspicions a reviewer confirms or dismisses.
import type { Page } from '@playwright/test';
import type { ProbeFinding, ProbeResult, Theme } from '../types';
import { ALLOW, type Allow } from './allow';
import { runProbe, type InPageElement } from './in-page';

export { ALLOW, type Allow } from './allow';

export interface ProbeOptions {
  /** The theme the page was opened in: part of every fingerprint. */
  theme: Theme;
  /** Suppressions; `ALLOW` when not given. */
  allow?: Allow[];
  /** Wait for the page to stand still first (the default), within this many ms. */
  settle?: boolean | number;
  /** For the probe's own tests: see `InPageOptions.mark`. */
  mark?: string;
  perRule?: number;
}

export type ProbedFinding = ProbeFinding & { elements: InPageElement[] };

/**
 * Waits until nothing is about to move: fonts loaded, finite animations and
 * transitions over, nothing `aria-busy`, two frames drawn. Infinite
 * animations — a spinner — are not waited for. Returns the time it took.
 */
export async function settle(page: Page, timeoutMs = 3000): Promise<number> {
  const started = performance.now();
  await page.evaluate(async (timeout) => {
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
  }, timeoutMs);
  return performance.now() - started;
}

/** Measures the page as it stands now; `ms` is the measuring alone. */
export async function probePage(
  page: Page,
  options: ProbeOptions,
): Promise<ProbeResult & { findings: ProbedFinding[] }> {
  if (options.settle !== false)
    await settle(
      page,
      typeof options.settle === 'number' ? options.settle : undefined,
    );
  const allow = options.allow ?? ALLOW;
  const started = performance.now();
  const raw = await page.evaluate(runProbe, {
    theme: options.theme,
    allow: allow.map(({ id, rule, selector, signature }) => ({
      id,
      rule,
      selector,
      signature,
    })),
    mark: options.mark,
    perRule: options.perRule,
  });
  const ms = Math.round(performance.now() - started);
  return {
    viewport: raw.viewport,
    dpr: raw.dpr,
    scrollY: raw.scrollY,
    root: raw.root,
    ms,
    findings: raw.findings,
    suppressed: raw.suppressed,
  };
}
