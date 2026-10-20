// `brief.md`: everything one reviewer is given, in the order a person reads
// it — the rules, who they are, the task, what the screens showed, the
// probe's suspicions, what to judge, and how to answer.
import type {
  Persona,
  PlayFinding,
  ProbeFinding,
  ProbeRule,
  Severity,
  StepRecord,
  VariantCode,
} from '../types';
import {
  criterion as criterionById,
  isCriterion,
  SEVERITIES,
  severityLabel,
  variantLabel,
  type Criterion,
} from './criteria';
import { attemptFile, type Attempt } from './runs';
import type { ReviewFinding } from './schema';

export interface Suspicion {
  fp: string;
  rule: ProbeRule;
  hint: ProbeFinding['hint'];
  message: string;
  elements: string[];
  measure: Record<string, number>;
  seen: {
    variant: VariantCode;
    attempt: string;
    step: number;
    crop?: string;
  }[];
}

export interface DismissedSuspicion {
  fp: string;
  rule?: ProbeRule;
  message?: string;
  review: string;
  why: string;
}

export interface EarlierFinding {
  key: string;
  severity: Severity;
  status: 'new' | 'still' | 'worse' | 'unclear';
  finding: ReviewFinding;
  /** Where it was last seen: an attempt and its screenshot. */
  attempt: string;
  step: number;
  shot: string;
  /**
   * Where it would show in the new plays: the same step of the same screen,
   * found by its words. Absent when the new plays have no such step.
   */
  now?: { attempt: string; step: number; label: string; shot: string };
}

export interface BriefContext {
  study: { id: string; title: string; question: string };
  jobId: string;
  scenario: { id: string; title: string };
  review: string;
  kind: 'fresh' | 'recheck';
  base?: string;
  persona: Persona;
  task: string;
  /** The input set, in the job's order of variants. */
  attempts: { variant: VariantCode; attempt: Attempt }[];
  criteria: { criterion: Criterion; variants: VariantCode[] }[];
  minScore: number;
  ask: Suspicion[];
  dismissed: DismissedSuspicion[];
  previous: EarlierFinding[];
  /** Every file the reviewer may read, absolute. */
  files: string[];
  /** The brief's own path and the answer's, absolute. */
  briefPath: string;
  out: string;
  /** How the brief names a file: as it is, absolute, for the Read tool. */
  show(file: string): string;
}

const RULES: Record<ProbeRule, string> = {
  overlap: 'overlap',
  'covered-control': 'covered control',
  'clipped-text': 'clipped text',
  'page-overflow': 'page wider than the screen',
  'leaves-viewport': 'leaves the screen',
  'near-miss': 'almost aligned',
  'uneven-gap': 'uneven gap',
  'small-target': 'small target',
  'broken-image': 'broken image',
};

const ACTIONS: Record<StepRecord['action'], string> = {
  open: 'open',
  click: 'click',
  tap: 'tap',
  fill: 'fill in',
  type: 'type',
  press: 'keys',
  hover: 'hover',
  look: 'look at',
  scroll: 'scroll',
  none: 'no action, only looks',
};

const PLAY_KINDS: Record<PlayFinding['kind'], string> = {
  'missing-control': 'could not find what to press',
  slow: 'waited long',
  'no-answer': 'got no answer',
  stopped: 'stopped',
  error: 'error',
};

export function ruleLabel(rule: ProbeRule): string {
  return RULES[rule] ?? rule;
}

/** Makes a value safe inside a Markdown table cell. */
function cell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function code(value: string): string {
  return `\`${value.replaceAll('`', "'")}\``;
}

function path(url: string): string {
  try {
    const parsed = new URL(url, 'http://site.invalid');
    return decodeURI(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return url;
  }
}

function ms(value: number): string {
  return value >= 1000
    ? `${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} s`
    : `${Math.round(value)} ms`;
}

/** A name in quotes, unless it brings its own. */
function quoted(name: string): string {
  return /^(["“«']).*(["”»'])$/.test(name) ? name : `“${name}”`;
}

function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function stepRow(
  attempt: Attempt,
  step: StepRecord,
  asked: Set<string>,
  show: BriefContext['show'],
): string {
  const label = `${cell(step.label)}<br>${code(path(step.url))}`;
  const action = [ACTIONS[step.action] ?? step.action];
  if (step.target) {
    action.push(quoted(cell(step.target.name)));
    if (!step.target.inView) action.push('(was off screen)');
    if (step.target.smallestSide !== undefined)
      action.push(`(smallest side ${Math.round(step.target.smallestSide)} px)`);
  }
  if (step.keys)
    action.push(`(${step.keys} key press${step.keys === 1 ? '' : 'es'})`);
  const pointer = step.pointer
    ? `${Math.round(step.pointer.travelPx)} px`
    : '—';
  const scroll = step.scroll?.needed
    ? `${Math.round(step.scroll.distancePx)} px`
    : '—';
  const wait: string[] = [];
  if (step.answer?.firstFeedbackMs !== undefined)
    wait.push(`first feedback ${ms(step.answer.firstFeedbackMs)}`);
  if (step.answer?.answerMs !== undefined)
    wait.push(`answer ${ms(step.answer.answerMs)}`);
  if (step.answer?.timedOut) wait.push('no answer in time');
  const blocked: string[] = [];
  if (step.blockedMs) blocked.push(`blocked ${ms(step.blockedMs)}`);
  if (step.coveredBy) blocked.push(`covered by ${cell(step.coveredBy)}`);
  const probe = step.probe.fps.filter((fp) => asked.has(fp));
  return `| ${step.n} | ${label} | ${action.join(' ')} | ${pointer} | ${scroll} | ${
    wait.join(', ') || '—'
  } | ${blocked.join(', ') || '—'} | ${
    probe.map((fp) => code(fp)).join(' ') || '—'
  } | ${code(show(attemptFile(attempt, step.marked)))} |`;
}

function screens(ctx: BriefContext, asked: Set<string>): string[] {
  const lines: string[] = [];
  for (const { variant, attempt } of ctx.attempts) {
    const meta = attempt.meta;
    const first = attempt.probe.values().next().value;
    lines.push(
      `### ${capital(variantLabel(variant))} — attempt ${code(attempt.id)}`,
      '',
    );
    const about: string[] = [];
    if (first)
      about.push(
        `Window ${first.viewport.width}×${first.viewport.height}${
          first.dpr !== 1 ? `, pixel density ${first.dpr}×` : ''
        }.`,
      );
    const stop = attempt.findings.find((f) => f.kind === 'stopped');
    if (meta.status === 'stopped')
      about.push(
        `**The play stopped${stop ? ` at step ${stop.step}` : ''}.**${
          stop ? ` ${sentence(stop.text)}` : ''
        } That is a result too: this person got no further.`,
      );
    else about.push(`The play went to the end in ${ms(meta.durationMs)}.`);
    if (meta.serverMode === 'dev' && ctx.persona.lens === 'persona')
      about.push(
        'The site ran in development mode: do not judge response times; judge the number of actions, the pointer’s travel and whether waiting is shown.',
      );
    if (meta.blockedHosts.length)
      about.push(
        `The lab blocked other sites (${meta.blockedHosts.join(', ')}): an empty space where another site’s picture or video would be is not the site’s fault.`,
      );
    lines.push(about.join(' '), '');
    if (meta.labNotes.length) {
      lines.push('Limits of the lab, not findings about the site:', '');
      for (const note of meta.labNotes) lines.push(`- ${note}`);
      lines.push('');
    }
    lines.push(
      '| # | Step | Action | Pointer travel | Scroll | Waiting | Hindrances | Probe | Screenshot |',
      '|---|---|---|---|---|---|---|---|---|',
      ...attempt.steps.map((step) => stepRow(attempt, step, asked, ctx.show)),
      '',
    );
    const own = attempt.findings.filter((f) => f.kind !== 'stopped');
    if (own.length) {
      lines.push('What the play itself noticed:', '');
      for (const finding of own)
        lines.push(
          `- step ${finding.step} — ${PLAY_KINDS[finding.kind] ?? finding.kind}, ${severityLabel(finding.severity)}: ${finding.text}`,
        );
      lines.push('');
    }
    const notes = attempt.steps.filter((s) => s.note);
    if (notes.length) {
      lines.push('Notes on steps:', '');
      for (const step of notes) lines.push(`- step ${step.n}: ${step.note}`);
      lines.push('');
    }
  }
  lines.push(
    'A marked screenshot (`.marked.png`) shows the pointer’s way and numbered frames around the probe’s suspicions. The plain screenshot lies next to it, under the same name without `.marked`.',
    '',
  );
  return lines;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function suspicions(ctx: BriefContext): string[] {
  const lines = ['## The probe’s suspicions', ''];
  if (!ctx.ask.length && !ctx.dismissed.length) {
    lines.push(
      'The probe suspected nothing. In your answer, `probe` is an empty object `{}`.',
      '',
    );
    return lines;
  }
  lines.push(
    'After every step a probe measures the layout: overlaps, cut-off text, almost aligned edges, uneven gaps, small targets. It is often wrong. Look at the close-up and the screenshot and give each fingerprint a verdict: `confirmed` — it is so, and a person would notice; `dismissed` — a false alarm; `unsure` — the screenshots do not tell. Describe what you confirm as a finding too, with the fingerprint in its `probe`.',
    '',
  );
  if (ctx.ask.length) {
    lines.push(
      '### Needs a verdict',
      '',
      '| Fingerprint | Rule | What | Seen at | Close-up |',
      '|---|---|---|---|---|',
    );
    for (const s of ctx.ask) {
      const what = [cell(s.message)];
      if (s.elements.length)
        what.push(`elements: ${cell(s.elements.join(' × '))}`);
      const measure = Object.entries(s.measure)
        .map(([key, value]) => `${key} ${Math.round(value * 10) / 10}`)
        .join(', ');
      if (measure) what.push(`measured: ${measure}`);
      const crops = s.seen
        .filter((x) => x.crop)
        .map((x) => code(ctx.show(x.crop!)));
      lines.push(
        `| ${code(s.fp)} | ${ruleLabel(s.rule)}${
          s.hint === 'serious' ? ' (probe: serious?)' : ''
        } | ${what.join('<br>')} | ${s.seen
          .map((x) => `${x.variant} step ${x.step}`)
          .join(', ')} | ${crops.join('<br>') || 'none, see the screenshot'} |`,
      );
    }
    lines.push('');
  }
  if (ctx.dismissed.length) {
    lines.push(
      '### Dismissed before',
      '',
      'An earlier review of this job dismissed these fingerprints. They need no verdict; leave them out of `probe`.',
      '',
    );
    for (const d of ctx.dismissed)
      lines.push(
        `- ${code(d.fp)}${d.rule ? ` — ${ruleLabel(d.rule)}` : ''}${
          d.message ? ` — ${d.message}` : ''
        } (${d.review}: ${d.why})`,
      );
    lines.push('');
  }
  return lines;
}

function criteriaSection(ctx: BriefContext): string[] {
  return [
    '## Criteria',
    '',
    `Score each criterion on each of its screens with a whole number from 1 to 10, or \`null\` where the steps never touched it. Explain any score below ${ctx.minScore} with a finding of that criterion on that screen.`,
    '',
    'Scale: 10 — could not be better; 8 — good, small things; 6 — gets in the way noticeably; 4 — done with difficulty; 2 — almost failed; 1 — failed.',
    '',
    '| id | Criterion | What to judge | Screens |',
    '|---|---|---|---|',
    ...ctx.criteria.map(
      ({ criterion, variants }) =>
        `| ${code(criterion.id)} | ${criterion.label} | ${cell(criterion.meaning)} | ${variants.join(', ')} |`,
    ),
    '',
    '## Severity',
    '',
    '| severity | When |',
    '|---|---|',
    ...SEVERITIES.map((s) => `| ${code(s.id)} | ${s.meaning} |`),
    '',
  ];
}

function previousSection(ctx: BriefContext): string[] {
  if (ctx.kind !== 'recheck') return [];
  const lines = ['## Earlier findings: a checklist', ''];
  if (!ctx.previous.length) {
    lines.push(
      `No findings were left open after ${ctx.base}. In your answer, \`previous\` is an empty array.`,
      '',
    );
    return lines;
  }
  lines.push(
    'Go through each earlier finding on the new plays above: open the new screenshot where it would show and say what you see there now. Mark each one in `previous`:',
    '',
    '- `status`: `fixed`; `still` (as it was); `worse`; or `unclear` (the new screenshots do not tell);',
    '- `attempt`, `step`, `shot`: the step and screenshot of the new plays you judged it on, never an old one;',
    '- `why`: what that new screenshot shows, in a sentence or two;',
    '- `severity` only if it changed; `probe` only for fingerprints of the new plays.',
    '',
    'The old screenshot is there for reference only: what counts is what the new plays show. Do not repeat these as new findings.',
    '',
  );
  for (const p of ctx.previous) {
    const f = p.finding;
    const criterion = isCriterion(f.criterion)
      ? criterionById(f.criterion).label
      : f.criterion;
    const again = ctx.attempts.some(({ attempt }) => attempt.id === p.attempt)
      ? ' This screen was not played again, so judge it on the same screenshot.'
      : '';
    lines.push(
      `- [ ] **${p.key}** · ${severityLabel(p.severity)} · ${criterion} (${code(f.criterion)})${
        p.status !== 'new' ? ` · last time: ${p.status}` : ''
      }: ${f.text}`,
      p.now
        ? `  - Look now at: ${code(ctx.show(p.now.shot))} (attempt ${code(p.now.attempt)}, step ${p.now.step}, “${p.now.label}”).${again}`
        : '  - The new plays have no such step: find where it would show, or mark it `unclear` on the closest step.',
      `  - Then: ${f.where} Expected: ${f.expected} Old screenshot, for reference only: ${code(ctx.show(p.shot))} (attempt ${code(p.attempt)}, step ${p.step}).`,
    );
  }
  lines.push('');
  return lines;
}

function example(ctx: BriefContext): string {
  const [first, second] = ctx.criteria;
  const scores: Record<string, Record<string, number | null>> = {};
  if (first)
    scores[first.criterion.id] = Object.fromEntries(
      first.variants.map((v, i) => [v, i === 0 ? 9 : 7]),
    );
  if (second)
    scores[second.criterion.id] = Object.fromEntries(
      second.variants.map((v, i) => [v, i === 0 ? null : 8]),
    );
  // The finding shows how one cites a suspicion of the probe, where there is one.
  const seen = ctx.ask[0]?.seen[0];
  const sample = seen
    ? ctx.attempts.find(({ attempt }) => attempt.id === seen.attempt)
    : ctx.attempts.at(-1);
  const step = seen
    ? sample?.attempt.steps.find((s) => s.n === seen.step)
    : sample?.attempt.steps.at(-1);
  const about =
    ctx.criteria.find(({ criterion }) =>
      ['tidiness', 'overlaps'].includes(criterion.id),
    ) ?? first;
  const answer = {
    schema: 2,
    job: ctx.jobId,
    review: ctx.review,
    kind: ctx.kind,
    attempts: Object.fromEntries(
      ctx.attempts.map(({ variant, attempt }) => [variant, attempt.id]),
    ),
    overall: 'Two or three sentences: how it went, in this person’s words.',
    scores,
    why: first
      ? {
          [first.criterion.id]:
            'Why the scores are what they are, in a sentence or two.',
        }
      : {},
    probe: ctx.ask[0]
      ? {
          [ctx.ask[0].fp]: {
            verdict: 'confirmed',
            why: 'In the close-up the label runs over the button.',
          },
        }
      : {},
    findings:
      sample && step && about
        ? [
            {
              id: 'F1',
              severity: 'minor',
              criterion: about.criterion.id,
              attempt: sample.attempt.id,
              step: step.n,
              shot: ctx.show(attemptFile(sample.attempt, step.marked)),
              where: 'Where on the screen: “the header, right of the title”.',
              text: 'What is wrong, as you saw it.',
              expected: 'What you expected.',
              fix: 'How it should be, in your view.',
              ...(ctx.ask[0] ? { probe: [ctx.ask[0].fp] } : {}),
            },
          ]
        : [],
    previous: ctx.previous[0]
      ? [
          {
            id: ctx.previous[0].key,
            status: 'fixed',
            attempt:
              ctx.previous[0].now?.attempt ?? ctx.attempts[0]!.attempt.id,
            step: ctx.previous[0].now?.step ?? 1,
            shot:
              ctx.previous[0].now?.shot !== undefined
                ? ctx.show(ctx.previous[0].now.shot)
                : '…',
            why: 'In the new screenshot the label sits above the button with a clear gap.',
          },
        ]
      : [],
    liked: ['What you liked, briefly.'],
    filesRead: [ctx.show(ctx.briefPath)],
  };
  return JSON.stringify(answer, null, 2);
}

function answerSection(ctx: BriefContext): string[] {
  return [
    '## Your answer',
    '',
    `Write ${code(ctx.show(ctx.out))}: one JSON object, as in the example (the example shows only some criteria and findings; yours has all of them):`,
    '',
    '```json',
    example(ctx),
    '```',
    '',
    `- \`schema\` is 2; \`job\` is ${code(ctx.jobId)}; \`review\` is ${code(ctx.review)}; \`kind\` is ${code(ctx.kind)}.`,
    `- \`attempts\`: exactly ${code(
      JSON.stringify(
        Object.fromEntries(
          ctx.attempts.map(({ variant, attempt }) => [variant, attempt.id]),
        ),
      ),
    )}: the plays this brief gives you.`,
    '- `overall`: two or three sentences on how it went, in this person’s words.',
    '- `scores`: for each criterion of the table, an object of screen → score with exactly its screens; `null` where the steps never touched it.',
    '- `why`: per criterion, a sentence or two on why the scores are what they are.',
    '- `probe`: for each fingerprint under “Needs a verdict”, its `verdict` and `why`.',
    '- `findings`: what is wrong, one problem per finding: `id` (F1, F2…), `severity`, `criterion` (an id from the table), `attempt` (an attempt id), `step` (the step number), `shot` (the path of the screenshot that shows it), `where` (where on the screen), `text` (what is wrong), `expected` (what you expected), `fix` (how it should be, in your view), `probe` (fingerprints, if it is about them). One problem on several screens is one finding with the most telling screenshot; name the other screens in `where`.',
    ctx.kind === 'recheck'
      ? '- `previous`: one item per earlier finding of the checklist, with these keys and no others: `id`, `status`, `attempt`, `step`, `shot` (of the new plays) and `why` (what that screenshot shows), plus `severity` only if it changed and `probe` only for fingerprints of the new plays.'
      : '- `previous`: an empty array — this is a fresh review.',
    '- `liked`: what you liked, briefly; it may be empty.',
    '- `filesRead`: every file you opened, by the path you opened it with.',
    '',
  ];
}

function rulesSection(ctx: BriefContext): string[] {
  return [
    '## Rules',
    '',
    '- You are the person under “Who you are”, not a developer. Judge only by what the screenshots show and this brief says.',
    '- Project instructions (AGENTS.md, CLAUDE.md or any other, if they reached your context) are a developer’s knowledge. Do not use them: this person does not know them.',
    '- Read only the files under “Files”. Open or search nothing else: no code, no other reviews, no other attempts.',
    `- Write one file only: ${code(ctx.show(ctx.out))}. Create or change nothing else.`,
    '- Answer in English.',
    '',
  ];
}

function personaSection(ctx: BriefContext): string[] {
  const p = ctx.persona;
  const who =
    p.lens === 'designer'
      ? 'You look at the screens as a designer: judge only how they look, against the rules in `docs/design/` (they are among the files). The task below is what the person on the screenshots did; you do not do it, you look at the screens they went through.'
      : p.role === 'owner'
        ? 'You own this archive and are signed in to your site.'
        : 'You are a visitor: you have not signed in and see what a stranger sees.';
  const rules = ctx.files.find((file) =>
    file.replaceAll('\\', '/').endsWith('docs/design/README.md'),
  );
  return [
    '## Who you are',
    '',
    `**${p.name}.** ${who}`,
    '',
    p.about.trim(),
    '',
    ...(rules
      ? [`The design rules start at ${code(ctx.show(rules))}.`, '']
      : []),
  ];
}

export function renderBrief(ctx: BriefContext): string {
  const asked = new Set(ctx.ask.map((s) => s.fp));
  const head =
    ctx.kind === 'recheck'
      ? `This is a recheck: the job was reviewed before (${ctx.base}) and has been played again since. Judge the new plays below: score them anew, go through the checklist of earlier findings on the new screenshots, and add new findings.`
      : 'This is a fresh review: you see this job for the first time and judge it on your own.';
  return [
    `# Review ${ctx.review} · “${ctx.scenario.title}” · ${ctx.persona.name}`,
    '',
    `Study “${ctx.study.title}”: ${ctx.study.question} Job ${code(ctx.jobId)}.`,
    '',
    head,
    '',
    ...rulesSection(ctx),
    ...personaSection(ctx),
    '## The task',
    '',
    `> ${ctx.task.trim().replaceAll('\n', '\n> ')}`,
    '',
    `Scenario “${ctx.scenario.title}”; screens: ${ctx.attempts
      .map(({ variant }) => `${variant} — ${variantLabel(variant)}`)
      .join('; ')}.`,
    '',
    ctx.kind === 'recheck' ? '## The new plays' : '## What the screens showed',
    '',
    ...screens(ctx, asked),
    ...previousSection(ctx),
    ...suspicions(ctx),
    ...criteriaSection(ctx),
    ...answerSection(ctx),
    '## Files',
    '',
    'Read only these:',
    '',
    ...ctx.files.map((file) => `- ${code(ctx.show(file))}`),
    '',
  ].join('\n');
}
