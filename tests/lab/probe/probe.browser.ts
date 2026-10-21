// Each fixture marks what the probe must find with `data-expect="<rule>"`
// (`<rule>@phone` where only a finger makes it a finding) and carries the
// decoys it must leave alone. The findings must name exactly the marked
// elements: nothing marked missed, nothing else found.
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { drawCrops, drawMarked } from './draw';
import { probePage } from './index';

const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixtures = readdirSync(dir).filter((name) => name.endsWith('.html'));

interface Expected {
  id: string;
  rule: string;
  hint: string | null;
}

async function expectedOn(page: Page, screen: string): Promise<Expected[]> {
  return page.evaluate(
    (screen) =>
      [...document.querySelectorAll('[data-expect]')].flatMap((el) =>
        el
          .getAttribute('data-expect')!
          .split(/\s+/)
          .map((token) => token.split('@'))
          .filter(([, only]) => !only || only === screen)
          .map(([rule]) => ({
            id: el.id,
            rule: rule!,
            hint: el.getAttribute('data-hint'),
          })),
      ),
    screen,
  );
}

async function open(page: Page, name: string) {
  await page.goto(pathToFileURL(dir + name).href);
  return probePage(page, { theme: 'light', mark: 'data-expect', allow: [] });
}

for (const name of fixtures)
  test(name, async ({ page }, testInfo) => {
    const result = await open(page, name);
    const expected = await expectedOn(page, testInfo.project.name);
    const report = JSON.stringify(
      result.findings.map(({ rule, hint, message, elements, measure }) => ({
        rule,
        hint,
        message,
        marks: elements.map((e) => e.mark),
        measure,
      })),
      null,
      2,
    );

    const found = new Set(
      result.findings.flatMap((finding) =>
        finding.elements.map(
          (element) =>
            `${finding.rule} ${element.mark || `(unmarked) ${element.desc}`}`,
        ),
      ),
    );
    const wanted = new Set(expected.map((e) => `${e.rule} ${e.id}`));
    expect([...found].sort(), report).toEqual([...wanted].sort());

    for (const e of expected.filter((e) => e.hint)) {
      const finding = result.findings.find(
        (f) => f.rule === e.rule && f.elements.some((el) => el.mark === e.id),
      );
      expect(finding?.hint, `${e.rule} ${e.id}`).toBe(e.hint);
    }

    const root = await page.evaluate(
      () => document.body.dataset.expectRoot ?? 'page',
    );
    expect(result.root).toBe(root);
    expect(result.ms).toBeLessThan(500);
  });

test('a fingerprint stays the same across plays', async ({ page }) => {
  const first = await open(page, 'near-miss.html');
  const second = await open(page, 'near-miss.html');
  expect(second.findings.map((f) => f.fp)).toEqual(
    first.findings.map((f) => f.fp),
  );
  expect(new Set(first.findings.map((f) => f.fp)).size).toBe(
    first.findings.length,
  );
});

test('marks and close-ups are drawn beside the page', async ({
  page,
}, testInfo) => {
  const result = await open(page, 'overlap.html');
  const shot = await page.screenshot();
  const marked = await drawMarked({
    shot,
    result,
    out: testInfo.outputPath('overlap.marked.png'),
    pointer: { from: [20, 20], to: [120, 60] },
  });
  const meta = await sharp(await readFile(marked)).metadata();
  const viewport = page.viewportSize()!;
  expect(meta.width).toBe((await sharp(shot).metadata()).width);
  expect(meta.height! / meta.width!).toBeCloseTo(
    viewport.height / viewport.width,
    2,
  );
  const once = await drawMarked({
    shot,
    result,
    out: testInfo.outputPath('overlap.1x.png'),
    scale: 1,
  });
  expect((await sharp(once).metadata()).width).toBe(viewport.width);
  const crops = await drawCrops({
    shot,
    result,
    dir: testInfo.outputPath('crops'),
  });
  expect(crops).toHaveLength(result.findings.length);
});
