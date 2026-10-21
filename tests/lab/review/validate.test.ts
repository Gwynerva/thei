import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFixture, FP, states } from './fixture';
import { prepareReview, type Prepared } from './pending';
import { loadJobs } from './runs';
import type { ReviewV2 as Review } from './schema';
import { validateReview, writeValidation } from './validate';

let runs: string;
let cleanup: () => void;
let prepared: Prepared;
// Each test writes the answer anew over one prepared review.
beforeAll(() => {
  ({ runs, cleanup } = copyFixture());
  prepared = prepareReview(states(runs)['diary-today.novice']!);
});
afterAll(() => cleanup());

const shot = (attempt: string, name: string) =>
  join(
    runs,
    'fixture',
    'jobs',
    'diary-today.novice',
    'attempts',
    attempt,
    'shots',
    name,
  );

/** A recheck of the novice's job that keeps every rule. */
function goodAnswer(): Review {
  const { inputs, args } = prepared;
  return {
    schema: 2,
    job: inputs.job,
    review: inputs.review,
    kind: 'recheck',
    attempts: { dd: '1020-090000-dd', pl: '1020-110000-pl' },
    overall: 'The button is in place now, but the menu is as small as before.',
    scores: Object.fromEntries(
      Object.entries(inputs.criteria).map(([id, variants]) => [
        id,
        Object.fromEntries(
          variants.map((v) => [v, id === 'errors' ? null : 9]),
        ),
      ]),
    ),
    why: { phone: 'The menu is still small.' },
    probe: {
      [FP.overlap]: {
        verdict: 'confirmed',
        why: 'The label lies on the button.',
      },
      [FP.smallMenu]: {
        verdict: 'confirmed',
        why: 'The menu is smaller than a finger.',
      },
      [FP.gap]: {
        verdict: 'dismissed',
        why: 'Two pixels do not show.',
      },
    },
    findings: [
      {
        id: 'F1',
        severity: 'minor',
        criterion: 'phone',
        attempt: '1020-110000-pl',
        step: 2,
        shot: shot('1020-110000-pl', '02-new-entry.marked.png'),
        where: 'The header, the menu button.',
        text: 'The menu is still small.',
        expected: 'A button for a finger.',
        fix: 'Make it larger.',
        probe: [FP.smallMenu],
      },
      {
        id: 'F2',
        severity: 'serious',
        criterion: 'tidiness',
        attempt: '1020-090000-dd',
        step: 2,
        shot: 'shots/02-new-entry.marked.png',
        where: 'The “New entry” button.',
        text: 'The label lies on the button.',
        expected: 'The label above the button.',
        fix: 'Move the button down.',
        probe: [FP.overlap],
      },
    ],
    previous: [
      {
        id: 'R1/F1',
        status: 'still',
        attempt: '1020-090000-dd',
        step: 2,
        shot: 'shots/02-new-entry.marked.png',
        why: 'The computer was not played again; the label still lies on the button.',
        probe: [FP.overlap],
      },
      {
        id: 'R1/F2',
        status: 'still',
        attempt: '1020-110000-pl',
        step: 2,
        shot: 'shots/02-new-entry.marked.png',
        why: 'The menu button in the header is as small as it was.',
      },
      {
        id: 'R1/F3',
        status: 'fixed',
        why: 'The button is on the dashboard now.',
        attempt: '1020-110000-pl',
        step: 2,
        shot: 'shots/02-new-entry.png',
      },
    ],
    liked: ['The button on the dashboard.'],
    filesRead: [
      args.brief,
      shot('1020-110000-pl', '02-new-entry.marked.png'),
      shot('1020-110000-pl', '02-new-entry.png'),
      // Relative to the study's run folder works too.
      'jobs/diary-today.novice/attempts/1020-090000-dd/shots/02-new-entry.marked.png',
    ],
  };
}

function check(answer: unknown) {
  writeFileSync(
    prepared.args.out,
    typeof answer === 'string' ? answer : JSON.stringify(answer),
  );
  const job = loadJobs(runs, 'fixture').find(
    (j) => j.job.jobId === 'diary-today.novice',
  )!;
  return validateReview(
    job,
    job.reviews.find((r) => r.id === 'R2')!,
  ).validation;
}

function broken(change: (answer: Review) => void) {
  const answer = goodAnswer();
  change(answer);
  return check(answer);
}

describe('a review', () => {
  it('passes when it keeps every rule', () => {
    const result = check(goodAnswer());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(['scores.errors is null on every screen']);
  });

  it('turns the pending job into a reviewed one', () => {
    check(goodAnswer());
    const novice = states(runs)['diary-today.novice']!;
    expect(novice.state).toBe('reviewed');
    expect(novice.covering!.id).toBe('R2');
  });

  it('is written down as validation.json', () => {
    const job = loadJobs(runs, 'fixture').find(
      (j) => j.job.jobId === 'diary-today.novice',
    )!;
    writeFileSync(prepared.args.out, JSON.stringify(goodAnswer()));
    const folder = loadJobs(runs, 'fixture')
      .find((j) => j.job.jobId === 'diary-today.novice')!
      .reviews.at(-1)!;
    const { validation } = validateReview(job, folder);
    writeValidation(folder, validation);
    expect(
      JSON.parse(readFileSync(join(folder.dir, 'validation.json'), 'utf8')),
    ).toMatchObject({
      job: 'diary-today.novice',
      review: 'R2',
      ok: true,
    });
  });

  it('fails when it is not JSON, or not of the schema', () => {
    expect(check('{ "schema": 1, ').errors[0]).toMatch(
      /^review.json is not JSON/,
    );
    const result = broken((a) => {
      (a as any).findings[0].severity = 'critical';
      (a as any).scores.feedback.dd = 11;
      (a as any).mood = 'good';
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/findings\.0\.severity/);
    expect(result.errors.join('\n')).toMatch(/scores\.feedback\.dd/);
    expect(result.errors.join('\n')).toMatch(/mood/);
  });

  it('fails without a score of every criterion on each of its screens', () => {
    const result = broken((a) => {
      delete a.scores.trust;
      delete a.scores.feedback!.pl;
      a.scores.phone!.dd = 9;
      a.scores.keyboard = { dd: 9 };
      a.scores.speed = { dd: 9 };
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'scores.trust is missing',
        'scores.feedback.pl is missing (a number, or null if untouched)',
        'scores.phone.dd: phone is not judged on dd',
        'scores.keyboard: not a criterion of this job',
        'scores.speed: no such criterion',
      ]),
    );
  });

  it('warns about a low score no finding explains', () => {
    const result = broken((a) => {
      a.scores.proximity!.dd = 5;
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain(
      'scores.proximity.dd is 5, below 8, with no finding of proximity on dd',
    );
  });

  it('fails without a verdict on each suspicion it was asked about', () => {
    const result = broken((a) => {
      delete a.probe[FP.gap];
      a.probe.ffff0000ffff0000 = { verdict: 'unsure', why: 'Cannot tell.' };
    });
    expect(result.errors).toEqual([`probe.${FP.gap}: no verdict`]);
    expect(result.warnings).toContain(
      'probe.ffff0000ffff0000: not one of the suspicions in the brief',
    );
  });

  it('fails when a finding points outside its play', () => {
    const result = broken((a) => {
      a.findings[0]!.attempt = '1020-090500-pl';
      a.findings[1]!.step = 7;
      a.findings.push(
        { ...a.findings[1]!, id: 'F3', step: 2, shot: 'shots/99-nothing.png' },
        {
          ...a.findings[1]!,
          id: 'F4',
          step: 2,
          shot: shot('1020-110000-pl', '02-new-entry.png'),
        },
        { ...a.findings[1]!, id: 'F5', step: 2, criterion: 'keyboard' },
        { ...a.findings[1]!, id: 'F6', step: 2, probe: ['0000111122223333'] },
        { ...a.findings[1]!, id: 'F6', step: 2 },
      );
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'findings F1: attempt "1020-090500-pl" is not in this review\'s set',
        'findings F2: attempt 1020-090000-dd has no step 7',
        'findings F3: shot shots/99-nothing.png does not exist',
        `findings F4: shot ${shot('1020-110000-pl', '02-new-entry.png')} is not of attempt 1020-090000-dd`,
        'findings F5: criterion "keyboard" is not one of this job\'s',
        'findings F6: fingerprint 0000111122223333 was not found by the probe in this set',
        'findings F6: the id is used twice',
      ]),
    );
  });

  it('fails when a recheck leaves an earlier finding unmarked or marks a stranger', () => {
    const result = broken((a) => {
      a.previous = [
        a.previous[0]!,
        a.previous[0]!,
        {
          ...a.previous[2]!,
          id: 'R1/F9',
          why: 'There is no such finding at all.',
        },
        { ...a.previous[2]!, step: 9 },
      ];
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'previous R1/F1: marked twice',
        'previous R1/F9: not one of the findings the brief listed',
        'previous R1/F3: attempt 1020-110000-pl has no step 9',
        'previous R1/F2: not marked',
      ]),
    );
  });

  it('fails when an earlier finding is not judged on a step of the new plays', () => {
    const result = broken((a) => {
      // The old phone play, which this recheck does not cover.
      a.previous[1] = {
        ...a.previous[1]!,
        attempt: '1020-090500-pl',
        shot: 'shots/02-find-it-in-the-menu.marked.png',
      };
      a.previous[2]!.probe = ['small-target:nothing0'];
      delete (a.previous[0] as any).shot;
      a.previous[0]!.why = 'Still.';
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'review.json previous.0.shot: Invalid input: expected string, received undefined',
        'review.json previous.0.why: say what the new screenshot shows',
      ]),
    );
    const judgedOnOld = broken((a) => {
      a.previous[1] = {
        ...a.previous[1]!,
        attempt: '1020-090500-pl',
        shot: 'shots/02-find-it-in-the-menu.marked.png',
      };
      a.previous[2]!.probe = ['small-target:nothing0'];
    });
    expect(judgedOnOld.errors).toEqual([
      'previous R1/F2: attempt "1020-090500-pl" is not in this review\'s set; judge it on the new plays',
      'previous R1/F3: fingerprint small-target:nothing0 was not found by the probe in this set',
    ]);
  });

  it('judges an answer to a brief of the first form by that brief', () => {
    // Reviews made before the brief asked for `attempts` and a place in the
    // new plays for each earlier finding keep counting.
    const { attempts, previous, ...rest } = goodAnswer();
    const result = check({
      ...rest,
      schema: 1,
      previous: previous.map(({ id, status, why }) => ({ id, status, why })),
    });
    expect(result.errors).toEqual([]);
    // But not a mix of the two.
    expect(check({ ...rest, schema: 1, attempts, previous }).ok).toBe(false);
  });

  it('fails when it names another set of attempts than the brief', () => {
    const result = broken((a) => {
      a.attempts = { dd: '1020-090000-dd', pl: '1020-090500-pl' };
    });
    expect(result.errors).toEqual([
      "attempts is {dd 1020-090000-dd, pl 1020-090500-pl}, but the brief's set is {dd 1020-090000-dd, pl 1020-110000-pl}",
    ]);
    expect(broken((a) => delete (a as any).attempts).errors).toEqual([
      'review.json attempts: Invalid input: expected record, received undefined',
    ]);
  });

  it('fails when it read a file it was not given', () => {
    const result = broken((a) => {
      a.filesRead.push(
        join(
          runs,
          'fixture',
          'jobs',
          'diary-today.novice',
          'reviews',
          'R1',
          'review.json',
        ),
        'C:/code/thei/AGENTS.md',
      );
    });
    expect(result.errors.filter((e) => e.startsWith('filesRead'))).toHaveLength(
      2,
    );
    expect(broken((a) => (a.filesRead = [a.filesRead[0]!])).warnings).toContain(
      'F2 cites jobs/diary-today.novice/attempts/1020-090000-dd/shots/02-new-entry.marked.png, which filesRead does not name'.replaceAll(
        '/',
        process.platform === 'win32' ? '\\' : '/',
      ),
    );
  });

  it('fails when it is not the review it was asked for', () => {
    const result = broken((a) => {
      a.job = 'diary-today.expert';
      a.review = 'R1';
      a.kind = 'fresh';
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'job is "diary-today.expert", but this is diary-today.novice',
        'review is "R1", but this is R2',
        'kind is "fresh", but the brief asked for a recheck',
      ]),
    );
  });
});
