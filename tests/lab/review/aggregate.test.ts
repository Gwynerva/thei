import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summarize } from './aggregate';
import { commands } from './commands';
import { cropName } from './crops';
import { copyFixture, FP, STUDY } from './fixture';
import { makeThumbnails, renderReport, writeReport } from './report';

let runs: string;
let cleanup: () => void;
beforeEach(() => ({ runs, cleanup } = copyFixture()));
afterEach(() => cleanup());

const NOW = new Date('2026-10-20T15:00:00Z');

describe('the summary of a study', () => {
  it('counts jobs by state and misses the bar until every job meets it', () => {
    const summary = summarize(runs, STUDY, NOW);
    expect(summary.counts).toEqual({
      jobs: 4,
      unplayed: 0,
      partial: 1,
      waiting: 2,
      reviewed: 1,
    });
    expect(summary.bar).toMatchObject({
      minScore: 8,
      minMean: 8.5,
      met: false,
    });
    const bar = Object.fromEntries(
      summary.jobs.map((job) => [job.jobId, job.bar]),
    );
    expect(bar['find-and-read.guest']).toEqual([]);
    expect(bar['diary-today.expert']).toEqual([
      { kind: 'partial', variants: ['pl'] },
    ]);
    expect(bar['find-and-read.designer']).toEqual([{ kind: 'waiting' }]);
    expect(bar['diary-today.novice']).toEqual([{ kind: 'waiting' }]);
  });

  it("shows each job's latest review, and whether it saw the current plays", () => {
    const jobs = Object.fromEntries(
      summarize(runs, STUDY, NOW).jobs.map((job) => [job.jobId, job]),
    );
    expect(jobs['find-and-read.guest']!.latest).toMatchObject({
      review: 'R2',
      kind: 'recheck',
      current: true,
      min: 8,
      open: { blocker: 0, serious: 0, minor: 0, taste: 0 },
    });
    expect(jobs['diary-today.novice']!.latest).toMatchObject({
      review: 'R1',
      current: false,
      min: 5,
      open: { serious: 2, minor: 1 },
    });
    expect(jobs['find-and-read.designer']!.latest).toBeUndefined();
    expect(jobs['diary-today.novice']!.next).toBe('recheck');
  });

  it('keeps the history of reviews and attempts', () => {
    const guest = summarize(runs, STUDY, NOW).jobs.find(
      (job) => job.jobId === 'find-and-read.guest',
    )!;
    expect(guest.reviews.map((r) => [r.review, r.kind, r.valid])).toEqual([
      ['R1', 'fresh', true],
      ['R2', 'recheck', true],
    ]);
    expect(guest.reviews[0]!.found.serious).toBe(1);
    expect(guest.reviews[1]!.previous.fixed).toBe(1);
    const novice = summarize(runs, STUDY, NOW).jobs.find(
      (job) => job.jobId === 'diary-today.novice',
    )!;
    expect(novice.attempts.map((a) => [a.id, a.status, a.inSet])).toEqual([
      ['1020-090000-dd', 'done', true],
      ['1020-090500-pl', 'done', false],
      ['1020-110000-pl', 'done', true],
      ['1020-111000-dd', 'error', false],
    ]);
    expect(novice.attempts[3]!.pageErrors).toBe(1);
  });

  it('lists open findings, the most severe first, with their close-ups', () => {
    const { findings } = summarize(runs, STUDY, NOW);
    expect(findings.map((f) => [f.key, f.severity])).toEqual([
      ['R1/F1', 'serious'],
      ['R1/F3', 'serious'],
      ['R1/F2', 'minor'],
    ]);
    expect(findings[0]!.crops).toEqual([
      join(
        runs,
        STUDY,
        'jobs/diary-today.novice/attempts/1020-090000-dd/crops',
        cropName(2, FP.overlap),
      ),
    ]);
    // Without the probe, the screenshot stands in.
    expect(findings[1]!.crops).toEqual([]);
    expect(existsSync(findings[1]!.shot!)).toBe(true);
  });

  it("measures the probe's rules by their latest verdicts", () => {
    const { probe } = summarize(runs, STUDY, NOW);
    expect(probe).toEqual([
      {
        rule: 'clipped-text',
        confirmed: 1,
        dismissed: 0,
        unsure: 0,
        precision: 1,
        demote: false,
      },
      {
        rule: 'near-miss',
        confirmed: 0,
        dismissed: 1,
        unsure: 0,
        precision: 0,
        demote: false,
      },
      {
        rule: 'overlap',
        confirmed: 1,
        dismissed: 0,
        unsure: 0,
        precision: 1,
        demote: false,
      },
      {
        rule: 'small-target',
        confirmed: 1,
        dismissed: 0,
        unsure: 0,
        precision: 1,
        demote: false,
      },
    ]);
  });

  it('reads the journal of changes', () => {
    const { changes } = summarize(runs, STUDY, NOW);
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({
      jobs: ['diary-today.novice'],
      variants: ['pl'],
    });
  });
});

describe('the report', () => {
  it('is one page that loads nothing from elsewhere', async () => {
    const summary = summarize(runs, STUDY, NOW);
    const thumbnails = await makeThumbnails(summary);
    // Two serious findings: one close-up, one screenshot.
    expect(thumbnails.size).toBe(2);
    for (const src of thumbnails.values())
      expect(src).toMatch(/^data:image\/jpeg;base64,/);
    const html = renderReport(summary, thumbnails);
    expect(html).not.toMatch(/<script|<link|@import|url\(|src="http/);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('The bar is not met');
    expect(html).toContain('Tidiness');
    expect(html).toContain(
      'The field label runs over the button; its letters lie on top of it.',
    );
    expect(html).toContain(
      '“New entry” moved from the menu onto the dashboard on phones.',
    );
    expect(html).toContain('not played on pl');
  });

  it('is written with its summary', async () => {
    const page = await writeReport(
      join(runs, STUDY),
      summarize(runs, STUDY, NOW),
    );
    expect(page).toBe(join(runs, STUDY, 'report', 'index.html'));
    expect(
      JSON.parse(
        readFileSync(join(runs, STUDY, 'report', 'summary.json'), 'utf8'),
      ),
    ).toMatchObject({
      schema: 1,
      study: { id: STUDY },
    });
  });
});

describe('the commands', () => {
  async function capture(run: () => Promise<number | void>) {
    const lines: string[] = [];
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((line) => lines.push(String(line)));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      return { code: (await run()) ?? 0, out: lines.join('\n') };
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  }

  it('hand the workflow its args', async () => {
    const { code, out } = await capture(() =>
      commands.jobs!.run([STUDY, '--pending', '--json', '--runs', runs]),
    );
    expect(code).toBe(0);
    const args = JSON.parse(out);
    expect(args.study).toBe(STUDY);
    expect(
      args.jobs.map((j: any) => [j.job, j.review, j.kind, j.lens]),
    ).toEqual([
      ['diary-today.novice', 'R2', 'recheck', 'persona'],
      ['find-and-read.designer', 'R1', 'fresh', 'designer'],
    ]);
    for (const job of args.jobs) expect(existsSync(job.brief)).toBe(true);
  });

  it('validate every answer and report the study', async () => {
    const validated = await capture(() =>
      commands.validate!.run([STUDY, '--json', '--runs', runs]),
    );
    expect(validated.code).toBe(0);
    expect(
      JSON.parse(validated.out).map((v: any) => [v.job, v.review, v.ok]),
    ).toEqual([
      ['diary-today.novice', 'R1', true],
      ['find-and-read.guest', 'R1', true],
      ['find-and-read.guest', 'R2', true],
    ]);
    const reported = await capture(() =>
      commands.report!.run([STUDY, '--runs', runs]),
    );
    expect(reported.out).toContain('✗ The bar is not met — 1/4 jobs reviewed');
    expect(existsSync(join(runs, STUDY, 'report', 'index.html'))).toBe(true);
  });
});
