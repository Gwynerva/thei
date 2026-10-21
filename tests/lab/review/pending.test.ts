import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptMeta } from '../types';
import { cropName } from './crops';
import { copyFixture, FP, states, STUDY } from './fixture';
import { dismissedFps, openFindings, prepareReview } from './pending';

let runs: string;
let cleanup: () => void;
beforeEach(() => ({ runs, cleanup } = copyFixture()));
afterEach(() => cleanup());

/** Plays an attempt again: a copy with a later start and the status given. */
function replay(
  job: string,
  from: string,
  id: string,
  status: AttemptMeta['status'] = 'done',
) {
  const attempts = join(runs, STUDY, 'jobs', job, 'attempts');
  cpSync(join(attempts, from), join(attempts, id), { recursive: true });
  const file = join(attempts, id, 'attempt.json');
  const meta = JSON.parse(readFileSync(file, 'utf8')) as AttemptMeta;
  writeFileSync(
    file,
    JSON.stringify({
      ...meta,
      attemptId: id,
      status,
      startedAt: '2026-10-21T08:00:00.000Z',
    }),
  );
}

describe('pending jobs', () => {
  it('take the latest done or stopped attempt of each variant', () => {
    const all = states(runs);
    // A newer computer play failed: it does not count.
    expect(all['diary-today.novice']!.set.dd!.id).toBe('1020-090000-dd');
    expect(all['diary-today.novice']!.set.pl!.id).toBe('1020-110000-pl');
    // A stopped play counts.
    expect(all['find-and-read.designer']!.set.pl!.id).toBe('1020-120500-pl');
    // A disturbed one does not.
    expect(all['diary-today.expert']!.missing).toEqual(['pl']);
  });

  it('wait when no review covers exactly the set', () => {
    const all = states(runs);
    expect(all['diary-today.novice']).toMatchObject({
      state: 'waiting',
      kind: 'recheck',
    });
    expect(all['find-and-read.designer']).toMatchObject({
      state: 'waiting',
      kind: 'fresh',
    });
    expect(all['find-and-read.guest']!.state).toBe('reviewed');
    expect(all['find-and-read.guest']!.covering!.id).toBe('R2');
    expect(all['diary-today.expert']!.state).toBe('partial');
  });

  it('make only the replayed job wait', () => {
    replay('find-and-read.guest', '1020-100000-pl', '1021-080000-pl');
    const all = states(runs);
    expect(all['find-and-read.guest']).toMatchObject({
      state: 'waiting',
      kind: 'recheck',
    });
    expect(all['diary-today.novice']!.state).toBe('waiting');
    expect(all['find-and-read.designer']!.state).toBe('waiting');
    expect(all['diary-today.expert']!.state).toBe('partial');
  });

  it('ignore a replay that failed or was disturbed', () => {
    replay('find-and-read.guest', '1020-100000-pl', '1021-080000-pl', 'error');
    replay(
      'find-and-read.guest',
      '1020-100000-pl',
      '1021-090000-pl',
      'disturbed',
    );
    expect(states(runs)['find-and-read.guest']!.state).toBe('reviewed');
  });

  it('do not count a review whose answer is broken', () => {
    const answer = join(
      runs,
      STUDY,
      'jobs',
      'find-and-read.guest',
      'reviews',
      'R2',
      'review.json',
    );
    writeFileSync(answer, '{ "schema": 1,');
    const guest = states(runs)['find-and-read.guest']!;
    expect(guest.state).toBe('waiting');
    expect(guest.checked.get('R2')!.validation.ok).toBe(false);
    expect(guest.valid.map((v) => v.folder.id)).toEqual(['R1']);
  });

  it('carry open findings through rechecks', () => {
    const all = states(runs);
    expect(
      openFindings(all['diary-today.novice']!, 'R1').map((f) => f.key),
    ).toEqual(['R1/F1', 'R1/F2', 'R1/F3']);
    // R2 marked the guest's only finding fixed.
    expect(
      openFindings(all['find-and-read.guest']!, 'R1').map((f) => f.key),
    ).toEqual(['R1/F1']);
    expect(openFindings(all['find-and-read.guest']!, 'R2')).toEqual([]);
  });

  it('remember what earlier reviews dismissed', () => {
    const novice = states(runs)['diary-today.novice']!;
    expect([...dismissedFps(novice).keys()]).toEqual([FP.nearMiss]);
  });
});

describe('preparing a review', () => {
  it('writes inputs and a brief in the next folder', () => {
    const novice = states(runs)['diary-today.novice']!;
    const prepared = prepareReview(novice, {
      now: new Date('2026-10-20T12:00:00Z'),
    });
    expect(prepared.args).toMatchObject({
      job: 'diary-today.novice',
      review: 'R2',
      kind: 'recheck',
      lens: 'persona',
    });
    expect(existsSync(prepared.args.brief)).toBe(true);
    expect(prepared.args.out).toBe(join(prepared.args.dir, 'review.json'));
    const { inputs } = prepared;
    expect(inputs.attempts).toEqual({
      dd: '1020-090000-dd',
      pl: '1020-110000-pl',
    });
    expect(inputs.base).toBe('R1');
    // Info is not asked, nor what R1 dismissed; what R1 confirmed is asked again.
    expect(inputs.probe.ask).toEqual([FP.overlap, FP.smallMenu, FP.gap]);
    expect(Object.keys(inputs.probe.dismissed)).toEqual([FP.nearMiss]);
    expect(inputs.previous).toEqual(['R1/F1', 'R1/F2', 'R1/F3']);
    expect(inputs.criteria.phone).toEqual(['pl']);
    expect(inputs.criteria.keyboard).toBeUndefined();
    expect(inputs.allowed.repo).toEqual([]);
    const run = inputs.allowed.run;
    expect(run[0]).toBe('jobs/diary-today.novice/reviews/R2/brief.md');
    expect(run).toContain(
      'jobs/diary-today.novice/attempts/1020-110000-pl/shots/02-new-entry.marked.png',
    );
    expect(run).toContain(
      `jobs/diary-today.novice/attempts/1020-110000-pl/crops/${cropName(3, FP.gap)}`,
    );
    // The screenshots of earlier findings, to compare with.
    expect(run).toContain(
      'jobs/diary-today.novice/attempts/1020-090500-pl/shots/02-find-it-in-the-menu.png',
    );
    // Neither the failed play nor the replaced one.
    expect(run.some((file) => file.includes('1020-111000-dd'))).toBe(false);
    expect(run.some((file) => file.includes('1020-090500-pl/shots/01-'))).toBe(
      false,
    );
  });

  it('reuses its folder until someone answers in it', () => {
    const first = prepareReview(states(runs)['find-and-read.designer']!);
    const again = prepareReview(states(runs)['find-and-read.designer']!);
    expect(first.args.review).toBe('R1');
    expect(again.args.review).toBe('R1');
    writeFileSync(again.args.out, '{}');
    // A broken answer stays as it was; the next review gets a folder of its own.
    expect(
      prepareReview(states(runs)['find-and-read.designer']!).args.review,
    ).toBe('R2');
  });

  it('gives the designer the design rules to read', () => {
    const { inputs, args } = prepareReview(
      states(runs)['find-and-read.designer']!,
    );
    expect(args.lens).toBe('designer');
    expect(inputs.kind).toBe('fresh');
    expect(inputs.allowed.repo).toContain('docs/design/README.md');
    expect(
      inputs.allowed.repo.every((file) => file.startsWith('docs/design/')),
    ).toBe(true);
    expect(Object.keys(inputs.criteria)).toContain('layout-phone');
    expect(inputs.criteria['layout-phone']).toEqual(['pl']);
  });

  it('can start over with a fresh review', () => {
    const { inputs } = prepareReview(states(runs)['diary-today.novice']!, {
      fresh: true,
    });
    expect(inputs.kind).toBe('fresh');
    expect(inputs.base).toBeUndefined();
    expect(inputs.previous).toEqual([]);
    // What was dismissed stays dismissed.
    expect(Object.keys(inputs.probe.dismissed)).toEqual([FP.nearMiss]);
  });

  it('refuses a job not played on every screen', () => {
    expect(() => prepareReview(states(runs)['diary-today.expert']!)).toThrow(
      /no usable play on pl/,
    );
  });
});
