import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cropName } from './crops';
import { copyFixture, FP, states } from './fixture';
import { prepareReview } from './pending';
import { ReviewSchema } from './schema';

let runs: string;
let cleanup: () => void;
// Preparing a review again rewrites the same folder.
beforeAll(() => ({ runs, cleanup } = copyFixture()));
afterAll(() => cleanup());

function exampleOf(brief: string): unknown {
  const match = /```json\n([\s\S]*?)\n```/.exec(brief);
  return JSON.parse(match![1]!);
}

describe('the brief of a recheck', () => {
  const brief = () => prepareReview(states(runs)['diary-today.novice']!).brief;

  it('opens with the rules of isolation and where to write', () => {
    const text = brief();
    expect(text).toMatch(/^# Review R2 · “Write today’s entry” · Novice/);
    expect(text).toContain('This is a recheck');
    expect(text).toContain('are a developer’s knowledge. Do not use them');
    expect(text).toContain('Read only the files under “Files”');
    expect(text).toContain(
      `Write one file only: \`${join(runs, 'fixture', 'jobs', 'diary-today.novice', 'reviews', 'R2', 'review.json')}\``,
    );
    expect(text).toContain('- Answer in English.');
  });

  it('tells who the persona is and the task', () => {
    const text = brief();
    expect(text).toContain('You own this archive and are signed in');
    expect(text).toContain('You do not know the words “relation”, “section”');
    expect(text).toContain('> Write how today went and mention “First snow”.');
  });

  it('tables the steps of each screen with their marked screenshots', () => {
    const text = brief();
    expect(text).toContain(
      '### Desktop, dark theme — attempt `1020-090000-dd`',
    );
    expect(text).toContain('### Phone, light theme — attempt `1020-110000-pl`');
    expect(text).toMatch(
      /\| 2 \| New entry<br>`\/admin\/` \| tap “New entry” \| 136 px \|.*02-new-entry\.marked\.png` \|/,
    );
    expect(text).toContain('Window 375×812, pixel density 2×.');
    expect(text).toContain('do not judge response times');
    // Neither the failed play nor the replaced phone play.
    expect(text).not.toContain('1020-111000-dd');
    expect(text).not.toContain('1020-090500-pl`, step 1');
  });

  it("asks a verdict on the probe's new suspicions only", () => {
    const text = brief();
    const asked = text.slice(
      text.indexOf('### Needs a verdict'),
      text.indexOf('### Dismissed before'),
    );
    expect(asked).toContain(`\`${FP.overlap}\` | overlap (probe: serious?)`);
    expect(asked).toContain(`\`${FP.smallMenu}\``);
    expect(asked).toContain(`\`${FP.gap}\` | uneven gap`);
    expect(asked).toContain(join('crops', cropName(3, FP.gap)));
    expect(asked).not.toContain(FP.nearMiss);
    expect(text).not.toContain(FP.info);
    const dismissed = text.slice(
      text.indexOf('### Dismissed before'),
      text.indexOf('## Criteria'),
    );
    expect(dismissed).toContain(`\`${FP.nearMiss}\` — almost aligned`);
    expect(dismissed).toContain('(R1: A pixel and a half does not show');
  });

  it('lists the criteria with their screens, the severities and the earlier findings', () => {
    const text = brief();
    expect(text).toMatch(/\| `phone` \| Phone \| [^|]+ \| pl \|/);
    expect(text).toMatch(/\| `tidiness` \| Tidiness \| [^|]+ \| dd, pl \|/);
    expect(text).not.toContain('`keyboard`');
    expect(text).toContain(
      '| `blocker` | The task cannot be finished, or what was done is lost. |',
    );
  });

  it('leads with the new plays, then checks the earlier findings on them', () => {
    const text = brief();
    const plays = text.indexOf('## The new plays');
    const checklist = text.indexOf('## Earlier findings: a checklist');
    const probe = text.indexOf('## The probe’s suspicions');
    expect(plays).toBeGreaterThan(0);
    expect(checklist).toBeGreaterThan(plays);
    expect(probe).toBeGreaterThan(checklist);
    const items = text.slice(checklist, probe);
    expect(items).toContain(
      '- [ ] **R1/F1** · serious · Tidiness (`tidiness`): The field label runs over the button',
    );
    expect(items).toContain(
      '- [ ] **R1/F3** · serious · Findability (`findability`): I could not find where to start',
    );
    expect(items).toContain(
      '`attempt`, `step`, `shot`: the step and screenshot of the new plays you judged it on, never an old one',
    );
    // The computer was not played again: the same screenshot.
    expect(items).toMatch(
      /Look now at: `[^`]*1020-090000-dd[^`]*02-new-entry\.marked\.png` \(attempt `1020-090000-dd`, step 2, “New entry”\)\. This screen was not played again/,
    );
    // The phone was: its step of the same number, as no step has the old words.
    expect(items).toMatch(
      /\*\*R1\/F2\*\*[^\n]*\n  - Look now at: `[^`]*1020-110000-pl[^`]*02-new-entry\.marked\.png` \(attempt `1020-110000-pl`, step 2, “New entry”\)\.\n/,
    );
    expect(items).toMatch(
      /Old screenshot, for reference only: `[^`]*1020-090500-pl[^`]*02-find-it-in-the-menu\.marked\.png`/,
    );
  });

  it('shows an example that the schema accepts', () => {
    const example = exampleOf(brief());
    const parsed = ReviewSchema.safeParse(example);
    expect(parsed.success).toBe(true);
    expect(example).toMatchObject({
      job: 'diary-today.novice',
      review: 'R2',
      kind: 'recheck',
      findings: [{ attempt: '1020-090000-dd', step: 2, probe: [FP.overlap] }],
      attempts: { dd: '1020-090000-dd', pl: '1020-110000-pl' },
      previous: [{ id: 'R1/F1', attempt: '1020-090000-dd', step: 2 }],
    });
  });

  it('lists exactly the files of its inputs', () => {
    const {
      brief: text,
      inputs,
      args,
    } = prepareReview(states(runs)['diary-today.novice']!);
    const files = text
      .slice(text.indexOf('## Files'))
      .split('\n')
      .filter((line) => line.startsWith('- `'))
      .map((line) => line.slice(3, -1));
    expect(files).toEqual(
      inputs.allowed.run.map((file) => join(runs, 'fixture', file)),
    );
    expect(readFileSync(args.brief, 'utf8')).toBe(text);
  });
});

describe('the brief of a fresh designer review', () => {
  it('judges looks against the design rules, and tells what stopped the play', () => {
    const { brief: text } = prepareReview(
      states(runs)['find-and-read.designer']!,
    );
    expect(text).toContain('This is a fresh review');
    expect(text).toContain('You look at the screens as a designer');
    expect(text).toMatch(/The design rules start at `.*README\.md`/);
    expect(text).toContain('| `layout-phone` | Phone layout |');
    expect(text).not.toContain('`findability`');
    expect(text).toContain(
      '**The play stopped at step 2.** The task stopped at step 2: search not found within 20 seconds. That is a result too',
    );
    expect(text).toContain(
      '- step 2 — could not find what to press, serious: The phone header has no search icon.',
    );
    expect(text).toContain('Limits of the lab, not findings about the site:');
    expect(text).toContain(
      'The lab blocked other sites (upload.wikimedia.org)',
    );
    // A designer does not judge speed.
    expect(text).not.toContain('do not judge response times');
    expect(text).toContain('`/search/?q=seedlings`');
    expect(text).toContain(
      '`previous`: an empty array — this is a fresh review.',
    );
    expect(text).not.toContain('## Earlier findings');
    expect(ReviewSchema.safeParse(exampleOf(text)).success).toBe(true);
  });
});
