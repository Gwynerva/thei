// The layout probe, from outside the page: wait for the page to stand
// still, measure it (`in-page.ts`), set aside what `allow.ts` lets be.
// Used after every recorded step of a play and on every screen of a sweep
// (the waiting itself is `settle` of `../variants.ts`, which the plays share);
// what it finds are suspicions a reviewer confirms or dismisses.
import type { Page } from '@playwright/test';
import type { ProbeFinding, ProbeResult, Theme } from '../types';
import { settle } from '../variants';
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

/** Measures the page as it stands now; `ms` is the measuring alone. */
export async function probePage(
  page: Page,
  options: ProbeOptions,
): Promise<ProbeResult & { findings: ProbedFinding[] }> {
  if (options.settle !== false)
    await settle(page, {
      timeoutMs:
        typeof options.settle === 'number' ? options.settle : undefined,
    });
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
