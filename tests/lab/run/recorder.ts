// Records a play step by step, the way a person meets the screen: a target is
// found by its role and name or its words, the pointer travels to it, the page
// scrolls if it must, the action is done, its answer awaited, and the screen
// photographed and measured by the probe.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type {
  Box,
  PlayFinding,
  ProbeResult,
  ScenarioContext,
  SiteEntity,
  StepAction,
  StepOptions,
  StepRecord,
  Target,
} from '../types';
import { transliterateCyrillic } from '../../../shared/language/slugify';
import { writeJson } from '../util';
import { settle } from '../variants';
import { drawStep, probe } from './marks';

/** Thrown when a play cannot go on: the step that stopped it is recorded. */
export class PlayStopped extends Error {}

/** The attribute a `shown` target is marked with while a step uses it. */
const SHOWN_MARK = 'data-lab-shown';

/**
 * Marks the visible element whose words — its own text, or what its CSS
 * draws before or after it — are the words given, and returns how to find
 * it. A person sees "Start writing…"; no query of roles or text does.
 */
async function markShown(
  page: Page,
  words: string,
): Promise<string | undefined> {
  return page.evaluate(
    ({ words, mark }) => {
      document
        .querySelectorAll(`[${mark}]`)
        .forEach((element) => element.removeAttribute(mark));
      const clean = (value: string) =>
        value
          .replace(/^["']|["']$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        if (!element.checkVisibility?.() && element.offsetParent === null)
          continue;
        const own = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join(' ');
        const drawn = ['::before', '::after'].map(
          (pseudo) => getComputedStyle(element, pseudo).content,
        );
        if (
          [own, ...drawn].some(
            (value) =>
              value && value !== 'none' && clean(value).includes(words),
          )
        ) {
          const token = Math.random().toString(36).slice(2);
          element.setAttribute(mark, token);
          return token;
        }
      }
      return undefined;
    },
    { words, mark: SHOWN_MARK },
  );
}

/**
 * Where a person looks: the top open modal when there is one — what lies
 * under it can be neither seen clearly nor reached — else the whole page.
 */
async function scopeOf(page: Page): Promise<Page | Locator> {
  const modals = page.locator(
    'dialog[open]:modal, [role="dialog"][aria-modal="true"]',
  );
  const count = await modals.count().catch(() => 0);
  for (let index = count - 1; index >= 0; index--)
    if (
      await modals
        .nth(index)
        .isVisible()
        .catch(() => false)
    )
      return modals.nth(index);
  return page;
}

/**
 * Whether a person could see the element: on screen and not under anything
 * (a sheet, a popup, a modal's backdrop), or off screen and reachable by
 * scrolling. Something under a sheet is in the page, but nobody sees it.
 */
async function unobstructed(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + Math.min(box.height / 2, 12);
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true;
      const hit = document.elementFromPoint(x, y);
      return Boolean(
        hit &&
        (element === hit || element.contains(hit) || hit.contains(element)),
      );
    })
    .catch(() => false);
}

export function locate(page: Page | Locator, target: Target): Locator {
  if (typeof target === 'string')
    return page.getByText(target, { exact: false });
  if ('shown' in target) return page.locator(`[${SHOWN_MARK}]`);
  if ('role' in target)
    return page.getByRole(target.role as Parameters<Page['getByRole']>[0], {
      ...(target.name !== undefined ? { name: target.name } : {}),
      ...(target.exact !== undefined ? { exact: target.exact } : {}),
    });
  if ('text' in target)
    return page.getByText(target.text, { exact: target.exact ?? false });
  if ('label' in target) return page.getByLabel(target.label);
  return page.getByPlaceholder(target.placeholder);
}

export function describeTarget(target: Target): string {
  if (typeof target === 'string') return `"${target}"`;
  if ('role' in target)
    return `${target.role}${target.name !== undefined ? ` "${String(target.name)}"` : ''}`;
  if ('text' in target) return `"${String(target.text)}"`;
  if ('label' in target) return `the field "${String(target.label)}"`;
  if ('shown' in target) return `"${target.shown}"`;
  return `the field showing "${String(target.placeholder)}"`;
}

function slug(label: string) {
  return (
    transliterateCyrillic(label)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'step'
  );
}

/** The whole tree hydrated, as the fixture's plugin marks it. */
export async function hydrated(page: Page, timeoutMs = 60_000) {
  await page
    .locator('html[data-nuxt-hydrated="true"]')
    .waitFor({ state: 'attached', timeout: timeoutMs });
}

export interface RecorderInput {
  page: Page;
  origin: string;
  dir: string;
  dpr: number;
  theme: string;
  phone: boolean;
  context: Omit<
    ScenarioContext,
    | 'page'
    | 'step'
    | 'sees'
    | 'note'
    | 'finding'
    | 'created'
    | 'entity'
    | 'phone'
  >;
}

export interface Recording {
  context: ScenarioContext;
  steps: StepRecord[];
  findings: PlayFinding[];
  notes: string[];
  created: {
    kind: 'project' | 'event' | 'diary' | 'page' | 'tag';
    uuid: string;
  }[];
}

export function record(input: RecorderInput): Recording {
  const { page, dir } = input;
  const startedAt = Date.now();
  const steps: StepRecord[] = [];
  const findings: PlayFinding[] = [];
  const notes: string[] = [];
  const created: Recording['created'] = [];
  let pointer: [number, number] | undefined;
  mkdirSync(join(dir, 'shots'), { recursive: true });
  mkdirSync(join(dir, 'probe'), { recursive: true });

  const viewportBox = () => page.viewportSize() ?? { width: 0, height: 0 };
  const inViewport = (box: Box) => {
    const viewport = viewportBox();
    return (
      box.y >= 0 &&
      box.x >= 0 &&
      box.y + box.height <= viewport.height &&
      box.x + box.width <= viewport.width
    );
  };

  async function find(
    target: Target,
    options: StepOptions,
  ): Promise<Locator | undefined> {
    const timeout = options.timeoutMs ?? 8000;
    const deadline = Date.now() + timeout;
    // The first match a person could see, in the top modal when one is open;
    // a hidden copy (a phone menu kept in the page) is passed over.
    while (Date.now() < deadline) {
      if (
        typeof target === 'object' &&
        'shown' in target &&
        !(await markShown(page, target.shown))
      ) {
        await page.waitForTimeout(200);
        continue;
      }
      const all = locate(await scopeOf(page), target);
      const count = await all.count();
      const visible: Locator[] = [];
      for (let index = 0; index < count; index++)
        if (
          (await all.nth(index).isVisible()) &&
          (await unobstructed(all.nth(index)))
        )
          visible.push(all.nth(index));
      const chosen = visible[options.nth ?? 0];
      if (chosen) return chosen;
      await page.waitForTimeout(200);
    }
    return undefined;
  }

  async function step(
    label: string,
    action?: StepAction,
    options: StepOptions = {},
  ): Promise<StepRecord> {
    const n = steps.length + 1;
    const base = `${String(n).padStart(2, '0')}-${slug(label)}`;
    const entry: StepRecord = {
      n,
      label,
      action: 'none',
      url: '',
      sinceStartMs: Date.now() - startedAt,
      shot: `shots/${base}.png`,
      marked: `shots/${base}.marked.png`,
      probe: { counts: {}, fps: [] },
    };
    let pointerFrom = pointer;
    let look: Box | undefined;
    let stopped: string | undefined;

    if (action && 'open' in action) {
      entry.action = 'open';
      await page.goto(`${input.origin}${action.open}`, {
        waitUntil: 'domcontentloaded',
      });
      await hydrated(page).catch(() =>
        notes.push(
          `step ${n}: the page did not mark itself hydrated within a minute`,
        ),
      );
    } else if (action && 'type' in action) {
      entry.action = 'type';
      await page.keyboard.type(action.type, { delay: 35 });
      entry.keys = [...action.type].length;
    } else if (action && 'press' in action) {
      entry.action = 'press';
      await page.keyboard.press(action.press);
      entry.keys = action.press.split('+').length;
    } else if (action && 'scroll' in action) {
      entry.action = 'scroll';
      await page.mouse.wheel(0, action.scroll);
      entry.scroll = { needed: true, distancePx: Math.abs(action.scroll) };
    } else if (action) {
      const target =
        'click' in action
          ? action.click
          : 'fill' in action
            ? action.fill
            : 'hover' in action
              ? action.hover
              : action.look;
      const kind =
        'click' in action
          ? 'click'
          : 'fill' in action
            ? 'fill'
            : 'hover' in action
              ? 'hover'
              : 'look';
      entry.action = kind === 'click' && input.phone ? 'tap' : kind;
      const locator = await find(target, options);
      if (!locator) {
        const text = `${describeTarget(target)} was not found where a person would look for it.`;
        findings.push({
          step: n,
          severity: options.optional ? 'serious' : 'blocker',
          kind: 'missing-control',
          text,
        });
        if (!options.optional) stopped = text;
      } else {
        const before = await locator.boundingBox();
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        const after = (await locator.boundingBox()) ?? before;
        if (after) {
          const name = (
            (await locator.getAttribute('aria-label')) ??
            (await locator.innerText().catch(() => '')) ??
            ''
          )
            .trim()
            .slice(0, 80);
          entry.target = {
            name: name || describeTarget(target),
            box: after,
            inView: before ? inViewport(before) : false,
            ...(input.phone
              ? { smallestSide: Math.min(after.width, after.height) }
              : {}),
          };
          if (before && Math.abs(before.y - after.y) > 1)
            entry.scroll = {
              needed: true,
              distancePx: Math.round(Math.abs(before.y - after.y)),
            };
          const to: [number, number] = [
            after.x + after.width / 2,
            after.y + after.height / 2,
          ];
          if (kind !== 'look') {
            if (pointerFrom)
              entry.pointer = {
                from: pointerFrom,
                to,
                travelPx: Math.round(
                  Math.hypot(to[0] - pointerFrom[0], to[1] - pointerFrom[1]),
                ),
              };
            const covered = await page.evaluate(([x, y]) => {
              const hit = document.elementFromPoint(x, y);
              return hit
                ? {
                    tag: hit.tagName,
                    text: (
                      hit.getAttribute('aria-label') ??
                      hit.textContent ??
                      ''
                    )
                      .trim()
                      .slice(0, 60),
                  }
                : null;
            }, to);
            const inside = await locator.evaluate((element, [x, y]) => {
              const hit = document.elementFromPoint(x, y);
              return Boolean(
                hit &&
                (element === hit ||
                  element.contains(hit) ||
                  hit.contains(element)),
              );
            }, to);
            if (!inside && covered)
              entry.coveredBy = covered.text || covered.tag.toLowerCase();
          } else look = after;
          const actionStarted = Date.now();
          try {
            // A control that cannot act yet but answers a press by saying
            // why — a form's Save, aria-disabled — is pressed as a person
            // would press it; Playwright alone would wait for it to act.
            const force =
              kind === 'click' &&
              (await locator.getAttribute('aria-disabled')) === 'true';
            if (kind === 'click')
              await (input.phone
                ? locator.tap({ timeout: 10_000, force })
                : locator.click({ timeout: 10_000, force }));
            if (kind === 'fill')
              await locator.fill((action as { text: string }).text, {
                timeout: 10_000,
              });
            if (kind === 'hover') await locator.hover({ timeout: 10_000 });
          } catch (error) {
            const text = `${describeTarget(target)} did not respond to the ${kind === 'click' ? (input.phone ? 'tap' : 'click') : kind}: ${(error as Error).message.split('\n')[0]}`;
            findings.push({
              step: n,
              severity: 'blocker',
              kind: 'error',
              text,
            });
            stopped = text;
          }
          const blocked = Date.now() - actionStarted;
          if (blocked > 600) entry.blockedMs = blocked;
          if (blocked > 1500)
            findings.push({
              step: n,
              severity: blocked > 3000 ? 'serious' : 'minor',
              kind: 'slow',
              text: `${describeTarget(target)} could only be used after ${Math.round(blocked / 100) / 10} s of waiting.`,
            });
          if (kind !== 'look') {
            pointer = to;
            pointerFrom = entry.pointer?.from;
          }
        }
      }
    }

    if (!stopped && (options.answer || options.answerGone)) {
      const started = Date.now();
      const timeout = options.timeoutMs ?? 8000;
      const wanted = options.answer ?? options.answerGone!;
      const ok = options.answer
        ? await find(options.answer, { ...options, timeoutMs: timeout }).then(
            Boolean,
          )
        : await locate(await scopeOf(page), wanted)
            .first()
            .waitFor({ state: 'hidden', timeout })
            .then(() => true)
            .catch(() => false);
      entry.answer = ok
        ? { answerMs: Date.now() - started }
        : { timedOut: true };
      if (!ok) {
        const text = options.answer
          ? `${describeTarget(wanted)} never appeared after the action.`
          : `${describeTarget(wanted)} did not go away after the action.`;
        // An answer the scenario only hoped for is a hint for the reviewer, who
        // sees the screen and judges whether a person missed it.
        findings.push({
          step: n,
          severity: options.optional ? 'minor' : 'blocker',
          kind: 'no-answer',
          text,
        });
        if (!options.optional) stopped = text;
      } else if (Date.now() - started > 3000)
        findings.push({
          step: n,
          severity: 'minor',
          kind: 'slow',
          text: `The answer took ${Math.round((Date.now() - started) / 100) / 10} s.`,
        });
    }

    await page
      .evaluate(
        (mark) =>
          document
            .querySelectorAll(`[${mark}]`)
            .forEach((element) => element.removeAttribute(mark)),
        SHOWN_MARK,
      )
      .catch(() => {});
    // A field that searches as one types waits a moment before it asks:
    // the network is quiet until then, and a shot taken at once shows
    // nothing yet. The probe measures the page as it then stands.
    await settle(page, { pauseMs: 250, networkIdleMs: 3000 });
    entry.url = page.url().replace(input.origin, '');
    await page.screenshot({ path: join(dir, entry.shot) });
    let result: ProbeResult | undefined;
    try {
      result = await probe(page, input.theme);
    } catch (error) {
      notes.push(
        `step ${n}: the layout probe failed (${(error as Error).message.split('\n')[0]})`,
      );
    }
    if (result) {
      writeJson(
        join(dir, 'probe', `${String(n).padStart(2, '0')}.json`),
        result,
      );
      for (const finding of result.findings) {
        entry.probe.counts[finding.rule] =
          (entry.probe.counts[finding.rule] ?? 0) + 1;
        entry.probe.fps.push(finding.fp);
      }
    }
    await drawStep({
      shot: join(dir, entry.shot),
      out: join(dir, entry.marked),
      dpr: input.dpr,
      ...(entry.pointer
        ? { pointer: { from: entry.pointer.from, to: entry.pointer.to } }
        : {}),
      ...(look ? { look } : {}),
      ...(result ? { result } : {}),
      cropsDir: join(dir, 'crops'),
      step: n,
    });
    steps.push(entry);
    if (stopped) {
      findings.push({
        step: n,
        severity: 'blocker',
        kind: 'stopped',
        text: `The task stopped at step ${n}: ${stopped}`,
      });
      throw new PlayStopped(stopped);
    }
    return entry;
  }

  const context: ScenarioContext = {
    ...input.context,
    page,
    phone: input.phone,
    entity(name) {
      const ref = input.context.picked[name];
      const entity = ref ? input.context.index.entities[ref] : undefined;
      if (!entity) throw new Error(`Nothing was picked as "${name}".`);
      return entity as SiteEntity;
    },
    step,
    async sees(target, timeoutMs = 2000) {
      return Boolean(await find(target, { timeoutMs }));
    },
    note: (text) => notes.push(text),
    finding: (finding) => findings.push({ ...finding, step: steps.length }),
    created: (item) => created.push(item),
  };
  return { context, steps, findings, notes, created };
}
