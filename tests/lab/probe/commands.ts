// The layout probe: what overlaps, is cut off, almost aligned, unevenly
// spaced or too small to tap, measured in the page.
import { mkdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chromium } from '@playwright/test';
import { labDir, repoRoot } from '../config';
import type {
  Commands,
  StatusLine,
  Theme,
  Variant,
  VariantCode,
} from '../types';
import { output, parse } from '../util';
import { ALLOW } from './allow';
import { drawCrops, drawMarked } from './draw';
import { probePage, settle } from './index';

const VARIANTS: Record<VariantCode, Variant> = {
  dd: { viewport: 'desktop', theme: 'dark' },
  dl: { viewport: 'desktop', theme: 'light' },
  pd: { viewport: 'phone', theme: 'dark' },
  pl: { viewport: 'phone', theme: 'light' },
};

/** The screens every part of the lab plays on. */
export const SCREENS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  phone: {
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
} as const;

/**
 * What a page reads before it loads, so it opens in the variant's theme:
 * the visitor's own setting (`app/scripts/visuals.ts`), with the lab's
 * accent and font.
 */
export function visualsScript(theme: Theme) {
  return `try { localStorage.setItem('thei-visuals', ${JSON.stringify(
    JSON.stringify({ theme, accentHue: 200, fontStyle: 'sans' }),
  )}); } catch {}`;
}

const probeDir = join(labDir, 'probe');

function slug(url: URL) {
  const path = `${url.host}${url.pathname}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return path.slice(0, 80) || 'page';
}

export const commands: Commands = {
  probe: {
    summary: 'Probe one address and print what it finds',
    usage: 'probe <url> [--variant dd|dl|pd|pl] [--json]',
    async run(args) {
      const { values, positionals } = parse(args, {
        variant: { type: 'string', default: 'dd' },
        json: { type: 'boolean' },
      });
      const [address] = positionals;
      const code = values.variant as VariantCode;
      const variant = VARIANTS[code];
      if (!address || !variant) {
        console.error(
          'Usage: bun run lab probe <url> [--variant dd|dl|pd|pl] [--json]',
        );
        return 2;
      }
      const url = new URL(address);
      const browser = await chromium.launch();
      try {
        const context = await browser.newContext({
          ...SCREENS[variant.viewport],
          colorScheme: variant.theme,
        });
        await context.addInitScript(visualsScript(variant.theme));
        const page = await context.newPage();
        const started = performance.now();
        await page.goto(url.href, { waitUntil: 'load' });
        // A Thei page says when it has hydrated; any other page has loaded.
        await page
          .waitForFunction(
            () => document.documentElement.dataset.nuxtHydrated === 'true',
            undefined,
            { timeout: 15_000 },
          )
          .catch(() => {});
        await page
          .waitForLoadState('networkidle', { timeout: 5_000 })
          .catch(() => {});
        const loadMs = performance.now() - started;
        const settleMs = await settle(page);
        const result = await probePage(page, {
          theme: variant.theme,
          settle: false,
        });

        const name = `${slug(url)}-${code}`;
        const shotPath = join(probeDir, `${name}.png`);
        const markedPath = join(probeDir, `${name}.marked.png`);
        const cropsDir = join(probeDir, name);
        await mkdir(probeDir, { recursive: true });
        await rm(cropsDir, { recursive: true, force: true });
        const shot = await page.screenshot({ path: shotPath });
        await drawMarked({ shot, result, out: markedPath });
        const crops = await drawCrops({ shot, result, dir: cropsDir });

        const files = { shot: shotPath, marked: markedPath, crops };
        output(values.json ?? false, { ...result, files }, () => {
          const lines = [
            `${url.href} — ${variant.viewport} ${variant.theme}, ${result.viewport.width}×${result.viewport.height} @${result.dpr}x, ${result.root}`,
            `probe ${result.ms} ms · settle ${Math.round(settleMs)} ms · load ${Math.round(loadMs)} ms · ${result.findings.length} found${
              result.suppressed.length
                ? ` · let be: ${result.suppressed.map((s) => `${s.allow} ×${s.count}`).join(', ')}`
                : ''
            }`,
            '',
          ];
          result.findings.forEach((finding, index) => {
            lines.push(
              `${String(index + 1).padStart(2)}. ${finding.rule} [${finding.hint}] ${finding.message}`,
              `    ${finding.elements.map((e) => e.path).join('  |  ')}`,
              `    ${Object.entries(finding.measure)
                .map(([key, value]) => `${key}=${value}`)
                .join(' ')}  ${finding.fp}`,
            );
          });
          lines.push('', `marked: ${relative(repoRoot, markedPath)}`);
          return lines;
        });
        return 0;
      } finally {
        await browser.close();
      }
    },
  },
};

export async function status(): Promise<StatusLine[]> {
  return [
    {
      part: 'probe',
      ok: true,
      text: `9 rules; ${ALLOW.length} suppression${ALLOW.length === 1 ? '' : 's'} in tests/lab/probe/allow.ts`,
    },
  ];
}
