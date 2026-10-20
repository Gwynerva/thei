// Plays a study: every job (a scenario for a persona) on every variant it
// asks for, or only those named. Each play is an attempt of its own, kept
// beside the job's earlier ones, so one scenario on one screen can be played
// again without touching the rest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext } from '@playwright/test';
import { labLoopbackOrigin, labOrigin, paths, repoRoot } from '../config';
import { staleSeed } from '../archive/dates';
import { SiteClient } from '../archive/site-client';
import { resolveBar } from '../review/criteria';
import { LAB_CREDENTIALS } from '../site/credentials';
import { playgroundIndex, playgroundState } from '../site/playground';
import { serverMode, waitUntilReady } from '../site/server';
import type {
  AttemptMeta,
  Persona,
  Ref,
  ScenarioDefinition,
  SiteIndex,
  VariantCode,
} from '../types';
import { readJson, writeJson } from '../util';
import {
  searchHistoryEntry,
  VARIANTS,
  variantCode,
  VIEWPORTS,
  visualsScript,
} from '../variants';
import { PlayStopped, record } from './recorder';
import {
  attemptStamp,
  jobDir,
  jobId,
  listAttempts,
  writeStudyFile,
  type JobFile,
} from './store';
import { loadPersonas, loadStudy } from './studies';
import { readTouched, tidy } from './tidy';

const PLAY_TIMEOUT_MS = 5 * 60 * 1000;

export interface PlayOptions {
  study: string;
  scenarios?: string[];
  personas?: string[];
  variants?: VariantCode[];
  /** Only variants a job has never been played on. */
  pending?: boolean;
  target?: 'lab' | 'playground';
  /** Play a site seeded on another day, its facts of today stale. */
  staleOk?: boolean;
  allowNetwork?: boolean;
  headed?: boolean;
  log?: (message: string) => void;
}

interface PlannedPlay {
  scenario: ScenarioDefinition;
  persona: Persona;
  role: 'owner' | 'visitor';
  variant: VariantCode;
  job: string;
}

function git(args: string[]) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

/** The code a play ran against: a commit, and a hash of what was changed on top. */
/** What the site runs: a change elsewhere (the lab itself, docs) disturbs no play. */
const SITE_CODE = [
  'app',
  'server',
  'shared',
  'modules',
  'public',
  'update',
  'nuxt.config.ts',
  'package.json',
  '.lab/site/nuxt.config.ts',
];

function codeState() {
  const status = git(['status', '--porcelain', '--', ...SITE_CODE]);
  const dirty = status.trim().length > 0;
  if (!dirty) return { commit: git(['rev-parse', 'HEAD']).trim(), dirty };
  const hash = createHash('sha256')
    .update(status)
    .update(git(['diff', 'HEAD', '--', ...SITE_CODE]));
  // New files are in no diff: their sizes and times stand in for them.
  for (const line of status.split('\n'))
    if (line.startsWith('?? ')) {
      try {
        const stat = statSync(join(repoRoot, line.slice(3).trim()));
        hash.update(`${line}:${stat.size}:${stat.mtimeMs}`);
      } catch {}
    }
  return {
    commit: git(['rev-parse', 'HEAD']).trim(),
    dirty,
    diffHash: hash.digest('hex').slice(0, 16),
  };
}

function siteIndexFor(target: 'lab' | 'playground'): SiteIndex {
  if (target === 'playground') {
    const playground = playgroundState();
    if (!playground)
      throw new Error(
        'The playground does not hold the archive: bun run lab up playground.',
      );
    const index = playgroundIndex();
    if (!index)
      throw new Error(`Snapshot ${playground.snapshot} has no site index.`);
    return index;
  }
  if (!existsSync(paths.siteIndex))
    throw new Error(
      'The lab site has no index: bun run lab up lab, or bun run lab build.',
    );
  return readJson<SiteIndex>(paths.siteIndex);
}

/** The browser's locale for the archive's language. */
function localeOf(index: SiteIndex) {
  return index.archive.language === 'ru' ? 'ru-RU' : 'en-US';
}

/** Fills `{name}` in a task with what was picked: a title, or a diary day. */
function taskText(
  task: ScenarioDefinition['task'],
  picked: Record<string, Ref>,
  index: SiteIndex,
) {
  if (typeof task === 'function') return task(picked, index);
  return task.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const entity = picked[name] ? index.entities[picked[name]!] : undefined;
    if (!entity) return whole;
    if (entity.title) return `"${entity.title}"`;
    if (entity.date)
      return new Date(`${entity.date}T00:00:00`).toLocaleDateString(
        localeOf(index),
        { day: 'numeric', month: 'long', year: 'numeric' },
      );
    return whole;
  });
}

export async function play(options: PlayOptions) {
  const log = options.log ?? ((message: string) => console.log(message));
  const target = options.target ?? 'lab';
  const study = await loadStudy(options.study);
  const personas = loadPersonas();
  for (const id of study.personas)
    if (!personas.has(id))
      throw new Error(
        `Study ${study.id} names persona "${id}", which tests/lab/personas/ lacks.`,
      );
  const index = siteIndexFor(target);
  // What the index calls today, the future and a period still running was
  // resolved on the day it was seeded: on another day a scenario picks by
  // facts that no longer hold.
  const stale = staleSeed(index.seedDay);
  if (stale && !options.staleOk)
    throw new Error(
      `The ${target === 'lab' ? 'lab site' : 'playground'} was ${stale}`,
    );
  const bar = resolveBar(study.bar);
  writeStudyFile(study, personas, bar);

  // ---------------------------------------------------------------- the plan
  const plan: PlannedPlay[] = [];
  for (const scenario of study.scenarios) {
    if (options.scenarios?.length && !options.scenarios.includes(scenario.id))
      continue;
    for (const personaId of study.personas) {
      if (options.personas?.length && !options.personas.includes(personaId))
        continue;
      const persona = personas.get(personaId)!;
      if (
        persona.lens === 'persona' &&
        (!persona.role || !scenario.roles.includes(persona.role))
      )
        continue;
      const role =
        persona.lens === 'designer' ? scenario.roles[0]! : persona.role!;
      const variants = study.variants.filter((code) =>
        persona.devices.includes(VARIANTS[code].viewport),
      );
      const job = jobId(scenario.id, persona.id);
      const file: JobFile = {
        jobId: job,
        study: study.id,
        scenario: scenario.id,
        scenarioTitle: scenario.title,
        persona: persona.id,
        lens: persona.lens,
        role,
        required: variants,
      };
      writeJson(join(jobDir(study.id, job), 'job.json'), file);
      const played = new Set(
        listAttempts(study.id, job).map((attempt) =>
          variantCode(attempt.variant),
        ),
      );
      for (const variant of variants) {
        if (options.variants?.length && !options.variants.includes(variant))
          continue;
        if (options.pending && played.has(variant)) continue;
        plan.push({ scenario, persona, role, variant, job });
      }
    }
  }
  if (!plan.length) {
    log('Nothing to play: no job and variant answer the filters.');
    return [];
  }
  log(
    `Playing ${plan.length} attempt(s) of study ${study.id} on the ${target === 'lab' ? 'lab site' : 'playground'}`,
  );

  // ------------------------------------------------------------ the owner
  const browserOrigin =
    target === 'lab' ? labOrigin() : 'http://localhost:3000';
  const apiOrigin =
    target === 'lab' ? labLoopbackOrigin() : 'http://127.0.0.1:3000';
  const site = new SiteClient(apiOrigin, log);
  if (target === 'lab') site.credentials = { ...LAB_CREDENTIALS };
  else {
    const config = readJson<{
      secretPhrase: string;
      password?: { fallback?: string };
    }>(join(paths.playgroundContent, 'thei.config.json'));
    const password = config.password?.fallback;
    if (!password)
      throw new Error(
        'The playground config has no password.fallback to sign in with.',
      );
    site.credentials = { secretPhrase: config.secretPhrase, password };
  }
  await site.waitOpen();
  await waitUntilReady(apiOrigin, log);
  await site.signIn();
  const host = new URL(browserOrigin).hostname;
  const ownerCookies = [...site.cookies].map(([name, value]) => ({
    name,
    value,
    domain: host,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Strict' as const,
  }));

  // ------------------------------------------------------------- the plays
  const browser = await chromium.launch({ headless: !options.headed });
  const results: AttemptMeta[] = [];
  try {
    for (const item of plan) {
      const variant = VARIANTS[item.variant];
      const attemptId = `${attemptStamp()}-${item.variant}`;
      const dir = join(jobDir(study.id, item.job), 'attempts', attemptId);
      const code = codeState();
      const started = Date.now();
      const picked = item.scenario.pick(
        index,
        `${item.scenario.id}:${item.variant}`,
      );
      // What the person searched for before, kept by their browser: put
      // there once, so what the play searches for joins it as it would.
      const history =
        item.scenario.searchHistory?.(picked, index) ??
        item.persona.searchHistory ??
        [];
      const context: BrowserContext = await browser.newContext({
        ...VIEWPORTS[variant.viewport],
        colorScheme: variant.theme,
        locale: localeOf(index),
        // The machine's own zone: the day the site was seeded on is its day.
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(history.length
          ? {
              storageState: {
                cookies: [],
                origins: [
                  {
                    origin: browserOrigin,
                    localStorage: [searchHistoryEntry(item.role, history)],
                  },
                ],
              },
            }
          : {}),
      });
      // The visitor's own setting of the theme, read before every page.
      await context.addInitScript(visualsScript(variant.theme));
      if (item.role === 'owner') await context.addCookies(ownerCookies);
      const blockedHosts = new Set<string>();
      if (!options.allowNetwork)
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (
            ['data:', 'blob:'].includes(url.protocol) ||
            [host, '127.0.0.1', 'localhost'].includes(url.hostname)
          )
            return route.continue();
          blockedHosts.add(url.host);
          return route.abort();
        });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on(
        'pageerror',
        (error) =>
          pageErrors.length < 20 &&
          pageErrors.push(error.message.split('\n')[0]!),
      );
      page.on(
        'console',
        (message) =>
          message.type() === 'error' &&
          consoleErrors.length < 20 &&
          consoleErrors.push(message.text().slice(0, 300)),
      );

      const task = taskText(item.scenario.task, picked, index);
      const before = await readTouched(
        site,
        index,
        item.scenario.touches?.(picked) ?? [],
      );
      const recording = record({
        page,
        origin: browserOrigin,
        dir,
        dpr: VIEWPORTS[variant.viewport].deviceScaleFactor,
        theme: variant.theme,
        phone: variant.viewport === 'phone',
        context: { persona: item.persona, variant, index, picked },
      });
      log(`  ${item.job} ${item.variant}: ${task}`);
      let status: AttemptMeta['status'] = 'done';
      const labNotes: string[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          item.scenario.run(recording.context),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new PlayStopped(
                    `the play ran out of its ${PLAY_TIMEOUT_MS / 60000} minutes`,
                  ),
                ),
              PLAY_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (error) {
        if (error instanceof PlayStopped) status = 'stopped';
        else {
          status = 'error';
          labNotes.push(
            `LAB: the scenario failed — ${(error as Error).message.split('\n')[0]}`,
          );
        }
      } finally {
        clearTimeout(timer);
      }
      await context.close();
      const tidied = await tidy(site, index, before, {
        created: recording.created,
        since: started,
      });
      const end = codeState();
      if (status !== 'error' && end.diffHash !== code.diffHash) {
        status = 'disturbed';
        labNotes.push(
          'LAB: the code changed during the play; reviews leave this attempt out.',
        );
      }
      const meta: AttemptMeta = {
        attemptId,
        study: study.id,
        jobId: item.job,
        scenario: item.scenario.id,
        persona: item.persona.id,
        variant,
        role: item.role,
        task,
        picked,
        status,
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        code: {
          ...code,
          ...(end.diffHash !== code.diffHash
            ? { diffHashEnd: end.diffHash }
            : {}),
        },
        archive: { version: index.archive.version },
        ...(index.snapshotId ? { snapshotId: index.snapshotId } : {}),
        target,
        serverMode: target === 'lab' ? await serverMode() : 'dev',
        pageErrors,
        consoleErrors,
        blockedHosts: [...blockedHosts],
        labNotes: [...labNotes, ...recording.notes],
        tidy: tidied,
      };
      writeJson(join(dir, 'steps.json'), recording.steps);
      writeJson(join(dir, 'findings.json'), recording.findings);
      // Last, and whole: an attempt is read as done once this is there.
      writeJson(join(dir, 'attempt.json'), meta, { atomic: true });
      results.push(meta);
      log(
        `    ${status}: ${recording.steps.length} steps, ${recording.findings.length} finding(s)` +
          `${tidied.leftovers.length ? `, ${tidied.leftovers.length} leftover(s): lab up lab before comparing` : ''}`,
      );
    }
  } finally {
    await browser.close();
  }
  return results;
}
