// Writes the hand-made run folder the review tests read:
// `bun tests/lab/review/fixtures/make.ts` rebuilds `runs/fixture/` from
// scratch. Its reviews are prepared by the review side itself and answered
// here, so they stay true to what `lab jobs --pending` writes.
//
// Four jobs, one in each state:
// - diary-today.novice — R1 saw the first plays; the phone was played again
//   since, so it waits for a recheck. A newer computer play failed (error).
// - find-and-read.guest — phone only; R1, then a recheck R2 of a new play.
// - find-and-read.designer — never reviewed; the phone play stopped halfway.
// - diary-today.expert — the phone play was disturbed, so it is not complete.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { repoRoot } from '../../config';
import { VIEWPORTS } from '../../variants';
import type {
  AttemptMeta,
  Box,
  Persona,
  PlayFinding,
  ProbeFinding,
  ProbeResult,
  StepRecord,
  VariantCode,
} from '../../types';
import { cropName } from '../crops';
import { jobState, prepareReview } from '../pending';
import { loadJobs } from '../runs';
import type { Review } from '../schema';
import type { JobFile, StudyFile } from '../runs';

const here = dirname(fileURLToPath(import.meta.url));
const runs = join(here, 'runs');
const studyRoot = join(runs, 'fixture');

const personas: Persona[] = [
  {
    id: 'novice',
    name: 'Novice',
    lens: 'persona',
    role: 'owner',
    experience: 'novice',
    devices: ['desktop', 'phone'],
    about:
      'You started your archive a week ago and write in it in the evenings, mostly on your phone. You read every label before you press and fear pressing the wrong thing: what if it gets erased. You do not know the words “relation”, “section” or “entity”, nor what the ✦ sign means. It annoys you when a button hides in a menu or when it is unclear whether what you wrote was saved.',
  },
  {
    id: 'expert',
    name: 'Expert',
    lens: 'persona',
    role: 'owner',
    experience: 'expert',
    devices: ['desktop', 'phone'],
    about:
      'You have kept your archive for years and know it by heart. You count clicks, keep your hands on the keyboard and expect shortcuts for frequent things. Needless confirmations, slow answers and focus lost after saving annoy you.',
  },
  {
    id: 'guest',
    name: 'Guest',
    lens: 'persona',
    role: 'visitor',
    experience: 'novice',
    devices: ['phone'],
    about:
      'You came by a link from a friend and see the site for the first time, on your phone, on the go. You do not know how it is built or what is in it. You leave if a page loads slowly or the text is small.',
  },
  {
    id: 'designer',
    name: 'Designer',
    lens: 'designer',
    devices: ['desktop', 'phone'],
    reads: ['docs/design/**'],
    about:
      'You judge only the visual quality of the screens: the grid, spacing, typography, consistency of components and both themes, against the rules in docs/design. You do not read code.',
  },
];

const study: StudyFile = {
  id: 'fixture',
  title: 'Today’s entry and search',
  question:
    'Can a newcomer write today’s entry, and can a guest find a project and read it?',
  personas,
  variants: ['dd', 'pl'],
  bar: { minScore: 8, minMean: 8.5, forbid: ['blocker', 'serious'] },
  scenarios: [
    {
      id: 'diary-today',
      title: 'Write today’s entry',
      roles: ['owner'],
      task: 'Write how today went and mention {event}.',
    },
    {
      id: 'find-and-read',
      title: 'Find and read a project',
      roles: ['visitor'],
      task: 'Find the project that talks about {word}, open its section and the third picture of its gallery.',
    },
  ],
};

// ─── Pictures ───────────────────────────────────────────────────────────────

/** Desktop shots are drawn at half size; a phone's at 1×, as reviewers get them. */
const SCALE: Record<'desktop' | 'phone', number> = { desktop: 0.5, phone: 1 };
const VIEWPORT = {
  desktop: VIEWPORTS.desktop.viewport,
  phone: VIEWPORTS.phone.viewport,
};

interface Screen {
  title: string;
  lines: number;
  button: string;
  /** A caption drawn over the button. */
  overlap?: boolean;
  /** The button drawn too small. */
  small?: boolean;
  /** The title runs off its box. */
  clipped?: boolean;
}

function viewportOf(variant: VariantCode) {
  return variant.startsWith('p') ? 'phone' : 'desktop';
}

/** The button's box in CSS px, where findings point. */
function buttonBox(variant: VariantCode, screen: Screen): Box {
  const phone = viewportOf(variant) === 'phone';
  const size = screen.small ? 28 : 44;
  return phone
    ? { x: 24, y: 520, width: screen.small ? 96 : 327, height: size }
    : { x: 160, y: 520, width: 220, height: size };
}

function screenSvg(variant: VariantCode, screen: Screen): string {
  const kind = viewportOf(variant);
  const { width, height } = VIEWPORT[kind];
  const s = SCALE[kind];
  const dark = variant.endsWith('d');
  const c = dark
    ? {
        bg: '#18181a',
        head: '#232326',
        text: '#ecebe6',
        mute: '#3a3a3f',
        accent: '#5b8cff',
      }
    : {
        bg: '#fafaf8',
        head: '#ffffff',
        text: '#1c1c1a',
        mute: '#e3e2dd',
        accent: '#2a62c9',
      };
  const phone = kind === 'phone';
  const left = phone ? 24 : 160;
  const button = buttonBox(variant, screen);
  const bars = Array.from({ length: screen.lines }, (_, i) => {
    const y = 200 + i * 34;
    const w = (phone ? 300 : 760) - ((i * 97) % 180);
    return `<rect x="${left}" y="${y}" width="${w}" height="14" rx="7" fill="${c.mute}"/>`;
  }).join('');
  const title = screen.clipped
    ? `<svg x="${left}" y="120" width="${phone ? 250 : 520}" height="44"><text x="0" y="34" font-size="30" font-weight="700" fill="${c.text}" font-family="Arial, sans-serif">${screen.title}: a very long title</text></svg>`
    : `<text x="${left}" y="154" font-size="30" font-weight="700" fill="${c.text}" font-family="Arial, sans-serif">${screen.title}</text>`;
  const caption = screen.overlap
    ? `<text x="${button.x + 12}" y="${button.y + 8}" font-size="18" fill="${c.text}" font-family="Arial, sans-serif">The field label runs over the button</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * s}" height="${height * s}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${c.bg}"/>
<rect width="${width}" height="56" fill="${c.head}"/>
<text x="${phone ? 16 : 160}" y="36" font-size="20" font-weight="700" fill="${c.text}" font-family="Arial, sans-serif">Archive</text>
${phone ? `<rect x="${width - 48}" y="16" width="24" height="3" fill="${c.text}"/><rect x="${width - 48}" y="26" width="24" height="3" fill="${c.text}"/><rect x="${width - 48}" y="36" width="24" height="3" fill="${c.text}"/>` : `<text x="${width - 420}" y="36" font-size="16" fill="${c.text}" font-family="Arial, sans-serif">Diary   Projects   Events   Search</text>`}
${title}
${bars}
<rect x="${button.x}" y="${button.y}" width="${button.width}" height="${button.height}" rx="8" fill="${c.accent}"/>
<text x="${button.x + button.width / 2}" y="${button.y + button.height / 2 + 6}" text-anchor="middle" font-size="16" fill="#ffffff" font-family="Arial, sans-serif">${screen.button}</text>
${caption}
</svg>`;
}

function marksSvg(
  variant: VariantCode,
  pointer: StepRecord['pointer'],
  findings: ProbeFinding[],
): string {
  const kind = viewportOf(variant);
  const { width, height } = VIEWPORT[kind];
  const s = SCALE[kind];
  const path = pointer
    ? `<polyline points="${pointer.from.join(',')} ${pointer.to.join(',')}" fill="none" stroke="#ff00aa" stroke-width="3" stroke-dasharray="8 6"/><circle cx="${pointer.to[0]}" cy="${pointer.to[1]}" r="9" fill="none" stroke="#ff00aa" stroke-width="3"/>`
    : '';
  const boxes = findings
    .flatMap((finding, i) =>
      finding.boxes.map(
        (box) =>
          `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="#ff3b30" stroke-width="3"/><rect x="${box.x - 2}" y="${box.y - 24}" width="22" height="22" fill="#ff3b30"/><text x="${box.x + 9}" y="${box.y - 7}" text-anchor="middle" font-size="15" font-weight="700" fill="#fff" font-family="Arial, sans-serif">${i + 1}</text>`,
      ),
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width * s}" height="${height * s}" viewBox="0 0 ${width} ${height}">${path}${boxes}</svg>`;
}

async function png(svg: string, file: string) {
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);
}

// ─── Plays ──────────────────────────────────────────────────────────────────

interface StepPlan {
  label: string;
  action: StepRecord['action'];
  url: string;
  target?: string;
  screen: Screen;
  probe?: (Omit<ProbeFinding, 'boxes'> & { box?: Box })[];
  keys?: number;
  answerMs?: number;
  scroll?: number;
  note?: string;
}

interface AttemptPlan {
  job: JobFile;
  id: string;
  variant: VariantCode;
  status: AttemptMeta['status'];
  startedAt: string;
  task: string;
  steps: StepPlan[];
  findings?: PlayFinding[];
  labNotes?: string[];
  pageErrors?: string[];
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

async function writeAttempt(plan: AttemptPlan) {
  const dir = join(studyRoot, 'jobs', plan.job.jobId, 'attempts', plan.id);
  const kind = viewportOf(plan.variant);
  const viewport = VIEWPORT[kind];
  const steps: StepRecord[] = [];
  let since = 0;
  let from: [number, number] = [viewport.width / 2, viewport.height / 2];
  for (const [i, step] of plan.steps.entries()) {
    const n = i + 1;
    const name = `${String(n).padStart(2, '0')}-${slug(step.label)}`;
    const button = buttonBox(plan.variant, step.screen);
    const findings: ProbeFinding[] = (step.probe ?? []).map(
      ({ box, ...f }) => ({
        ...f,
        boxes: [box ?? button],
      }),
    );
    const pointer =
      step.action === 'click' || step.action === 'tap'
        ? {
            from,
            to: [button.x + button.width / 2, button.y + button.height / 2] as [
              number,
              number,
            ],
            travelPx: 0,
          }
        : undefined;
    if (pointer) {
      pointer.travelPx = Math.round(
        Math.hypot(
          pointer.to[0] - pointer.from[0],
          pointer.to[1] - pointer.from[1],
        ),
      );
      from = pointer.to;
    }
    since += step.answerMs ?? 400;
    const record: StepRecord = {
      n,
      label: step.label,
      action: step.action,
      url: `http://lab.localhost:3003${step.url}`,
      sinceStartMs: since,
      shot: `shots/${name}.png`,
      marked: `shots/${name}.marked.png`,
      ...(step.target
        ? {
            target: {
              name: step.target,
              box: button,
              inView: true,
              ...(step.screen.small ? { smallestSide: button.height } : {}),
            },
          }
        : {}),
      ...(pointer ? { pointer } : {}),
      ...(step.scroll
        ? { scroll: { needed: true, distancePx: step.scroll } }
        : {}),
      ...(step.keys ? { keys: step.keys } : {}),
      answer: { firstFeedbackMs: 90, answerMs: step.answerMs ?? 400 },
      probe: {
        counts: Object.fromEntries(
          [...new Set(findings.map((f) => f.rule))].map((rule) => [
            rule,
            findings.filter((f) => f.rule === rule).length,
          ]),
        ),
        fps: findings.map((f) => f.fp),
      },
      ...(step.note ? { note: step.note } : {}),
    };
    steps.push(record);
    const probe: ProbeResult = {
      viewport,
      dpr: kind === 'phone' ? 2 : 1,
      scrollY: step.scroll ?? 0,
      root: 'page',
      ms: 80 + n * 7,
      findings,
      suppressed: [],
    };
    mkdirSync(join(dir, 'probe'), { recursive: true });
    writeFileSync(
      join(dir, 'probe', `${String(n).padStart(2, '0')}.json`),
      `${JSON.stringify(probe, null, 2)}\n`,
    );
    const base = screenSvg(plan.variant, step.screen);
    await png(base, join(dir, record.shot));
    const markedFile = join(dir, record.marked);
    const scale = SCALE[kind];
    const composite = await sharp(Buffer.from(base))
      .composite([
        { input: Buffer.from(marksSvg(plan.variant, pointer, findings)) },
      ])
      .png()
      .toBuffer();
    await sharp(composite)
      .png({ compressionLevel: 9, palette: true })
      .toFile(markedFile);
    for (const finding of findings) {
      const box = finding.boxes[0]!;
      const pad = 24;
      const left = Math.max(0, Math.floor((box.x - pad) * scale));
      const top = Math.max(0, Math.floor((box.y - pad - 24) * scale));
      const width = Math.min(
        Math.ceil((box.width + pad * 2) * scale),
        viewport.width * scale - left,
      );
      const height = Math.min(
        Math.ceil((box.height + pad * 2 + 24) * scale),
        viewport.height * scale - top,
      );
      const crop = join(dir, 'crops', cropName(n, finding.fp));
      mkdirSync(dirname(crop), { recursive: true });
      await sharp(composite)
        .extract({ left, top, width, height })
        .resize({ width: Math.round(width * (2 / scale)) })
        .png({ compressionLevel: 9, palette: true })
        .toFile(crop);
    }
  }
  const meta: AttemptMeta = {
    attemptId: plan.id,
    study: study.id,
    jobId: plan.job.jobId,
    scenario: plan.job.scenario,
    persona: plan.job.persona,
    variant: {
      viewport: kind,
      theme: plan.variant.endsWith('d') ? 'dark' : 'light',
    },
    role: plan.job.role,
    task: plan.task,
    picked: PICKED[plan.job.scenario]!,
    status: plan.status,
    startedAt: plan.startedAt,
    durationMs: since + 1200,
    code: {
      commit: 'c81a2f1f',
      dirty: true,
      diffHash: 'a1',
      diffHashEnd: plan.status === 'disturbed' ? 'b2' : 'a1',
    },
    archive: { version: '1.0.0' },
    snapshotId: 'conformance-1020',
    target: 'lab',
    serverMode: 'dev',
    pageErrors: plan.pageErrors ?? [],
    consoleErrors: [],
    blockedHosts: plan.job.lens === 'designer' ? ['upload.wikimedia.org'] : [],
    labNotes: plan.labNotes ?? [],
    tidy: { restored: [], deleted: [], leftovers: [] },
  };
  writeFileSync(
    join(dir, 'attempt.json'),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
  writeFileSync(join(dir, 'steps.json'), `${JSON.stringify(steps, null, 2)}\n`);
  writeFileSync(
    join(dir, 'findings.json'),
    `${JSON.stringify(plan.findings ?? [], null, 2)}\n`,
  );
}

function writeJob(job: JobFile) {
  const dir = join(studyRoot, 'jobs', job.jobId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'job.json'), `${JSON.stringify(job, null, 2)}\n`);
}

/** What each scenario picked from the site, as the plays record it. */
const PICKED: Record<string, AttemptMeta['picked']> = {
  'diary-today': { event: 'event:first-snow' },
  'find-and-read': { project: 'project:greenhouse' },
};

function job(
  scenario: string,
  persona: Persona,
  required: VariantCode[],
): JobFile {
  const definition = study.scenarios!.find((s) => s.id === scenario)!;
  return {
    jobId: `${scenario}.${persona.id}`,
    study: study.id,
    scenario,
    scenarioTitle: definition.title,
    persona: persona.id,
    lens: persona.lens,
    role: definition.roles[0]!,
    required,
  };
}

const [novice, expert, guest, designer] = personas as [
  Persona,
  Persona,
  Persona,
  Persona,
];
const diaryNovice = job('diary-today', novice, ['dd', 'pl']);
const diaryExpert = job('diary-today', expert, ['dd', 'pl']);
const findGuest = job('find-and-read', guest, ['pl']);
const findDesigner = job('find-and-read', designer, ['dd', 'pl']);

const diaryTask = 'Write how today went and mention “First snow”.';
const findTask =
  'Find the project that talks about “seedlings”, open its section and the third picture of its gallery.';

/** Fingerprints, as the probe makes them: `rule:hash`. */
const FP = {
  overlap: 'overlap:k3f9a2x7qd',
  nearMiss: 'near-miss:b7c2d9e0wf',
  info: 'clipped-text:c0ffee12aa',
  smallMenu: 'small-target:d4e5f6a7b8',
  gap: 'uneven-gap:e9d8c7b6a5',
  clipped: 'clipped-text:f1e2d3c4b5',
  designerNear: 'near-miss:0a1b2c3d4e',
  designerOverlap: 'overlap:1b2c3d4e5f',
};

const editor: Screen = { title: 'Today', lines: 5, button: 'Save' };

async function main() {
  rmSync(studyRoot, { recursive: true, force: true });
  mkdirSync(studyRoot, { recursive: true });
  writeFileSync(
    join(studyRoot, 'study.json'),
    `${JSON.stringify(study, null, 2)}\n`,
  );
  for (const j of [diaryNovice, diaryExpert, findGuest, findDesigner])
    writeJob(j);

  // The first plays.
  await writeAttempt({
    job: diaryNovice,
    id: '1020-090000-dd',
    variant: 'dd',
    status: 'done',
    startedAt: '2026-10-20T09:00:00.000Z',
    task: diaryTask,
    steps: [
      {
        label: 'Open the dashboard',
        action: 'open',
        url: '/admin/',
        screen: { title: 'Dashboard', lines: 4, button: 'New entry' },
      },
      {
        label: 'New entry',
        action: 'click',
        url: '/admin/',
        target: 'New entry',
        screen: {
          title: 'Dashboard',
          lines: 4,
          button: 'New entry',
          overlap: true,
        },
        probe: [
          {
            fp: FP.overlap,
            rule: 'overlap',
            hint: 'serious',
            elements: [
              { path: 'main > label', desc: 'label “Field label”' },
              { path: 'main > button', desc: 'button “New entry”' },
            ],
            measure: { overlapPx2: 640 },
            message: 'The field label runs over the “New entry” button.',
          },
          {
            fp: FP.nearMiss,
            rule: 'near-miss',
            hint: 'minor',
            box: { x: 160, y: 196, width: 760, height: 20 },
            elements: [
              { path: 'main > p:nth-child(1)', desc: 'paragraph 1' },
              { path: 'main > p:nth-child(2)', desc: 'paragraph 2' },
            ],
            measure: { deltaPx: 1.5 },
            message: 'The left edges of two paragraphs differ by 1.5 px.',
          },
        ],
      },
      {
        label: 'Write and save',
        action: 'fill',
        url: '/admin/diary/2026-10-20/',
        target: 'Entry text',
        screen: editor,
        answerMs: 650,
        probe: [
          {
            fp: FP.info,
            rule: 'clipped-text',
            hint: 'info',
            elements: [{ path: 'header > span', desc: 'date in the header' }],
            measure: { visible: 0.9 },
            message: 'The date in the header is cut with an ellipsis.',
          },
        ],
      },
    ],
  });
  await writeAttempt({
    job: diaryNovice,
    id: '1020-090500-pl',
    variant: 'pl',
    status: 'done',
    startedAt: '2026-10-20T09:05:00.000Z',
    task: diaryTask,
    steps: [
      {
        label: 'Open the dashboard',
        action: 'open',
        url: '/admin/',
        screen: { title: 'Dashboard', lines: 6, button: 'Menu' },
      },
      {
        label: 'Find it in the menu',
        action: 'tap',
        url: '/admin/',
        target: 'Menu',
        screen: { title: 'Dashboard', lines: 6, button: 'Menu', small: true },
        note: 'There was no “New entry” button on the screen; it was only in the menu.',
        probe: [
          {
            fp: FP.smallMenu,
            rule: 'small-target',
            hint: 'serious',
            elements: [{ path: 'header > button', desc: 'button “Menu”' }],
            measure: { smallestSidePx: 28 },
            message:
              'The “Menu” button is 28 px, under the 39 px a finger needs.',
          },
        ],
      },
      {
        label: 'Write and save',
        action: 'fill',
        url: '/admin/diary/2026-10-20/',
        target: 'Entry text',
        screen: editor,
        scroll: 220,
      },
    ],
    findings: [
      {
        step: 2,
        severity: 'minor',
        kind: 'missing-control',
        text: 'The “New entry” button had to be looked for in the menu.',
      },
    ],
  });
  await writeAttempt({
    job: findGuest,
    id: '1019-180000-pl',
    variant: 'pl',
    status: 'done',
    startedAt: '2026-10-19T18:00:00.000Z',
    task: findTask,
    steps: [
      {
        label: 'Find “seedlings”',
        action: 'type',
        url: '/search/?q=seedlings',
        screen: {
          title: 'A greenhouse on the balcony',
          lines: 7,
          button: 'Open',
          clipped: true,
        },
        probe: [
          {
            fp: FP.clipped,
            rule: 'clipped-text',
            hint: 'serious',
            box: { x: 24, y: 120, width: 250, height: 44 },
            elements: [
              {
                path: 'main > h1',
                desc: 'heading “A greenhouse on the balcony…”',
              },
            ],
            measure: { visible: 0.62 },
            message:
              'The result’s heading is cut off without an ellipsis: 62% is visible.',
          },
        ],
      },
      {
        label: 'Open the project',
        action: 'tap',
        url: '/projects/greenhouse/',
        target: 'Open',
        screen: { title: 'Greenhouse', lines: 8, button: 'Gallery' },
      },
    ],
  });

  // Fresh reviews of the first plays.
  const show = (file: string) => relative(repoRoot, file).replaceAll('\\', '/');
  const prepare = (jobId: string, now: string) => {
    const state = loadJobs(runs, study.id)
      .map(jobState)
      .find((s) => s.loaded.job.jobId === jobId)!;
    return prepareReview(state, { now: new Date(now), show });
  };
  const answer = (review: Review, dir: string) =>
    writeFileSync(
      join(dir, 'review.json'),
      `${JSON.stringify(review, null, 2)}\n`,
    );
  const runRel = (file: string) =>
    relative(studyRoot, file).replaceAll('\\', '/');

  const noviceR1 = prepare(diaryNovice.jobId, '2026-10-20T09:20:00.000Z');
  const noviceDir = join(studyRoot, 'jobs', diaryNovice.jobId);
  const nAttempts = (id: string) => join(noviceDir, 'attempts', id);
  answer(
    {
      schema: 2,
      job: diaryNovice.jobId,
      review: 'R1',
      kind: 'fresh',
      attempts: { dd: '1020-090000-dd', pl: '1020-090500-pl' },
      overall:
        'I managed to write the day, but on the phone I looked for a long time for where to start: the button hides in the menu, and the menu itself is tiny. On the computer a label ran over the button and I doubted I was pressing the right thing.',
      scores: {
        findability: { dd: 8, pl: 5 },
        proximity: { dd: 8, pl: 6 },
        feedback: { dd: 9, pl: 9 },
        control: { dd: 9, pl: 9 },
        wording: { dd: 9, pl: 9 },
        trust: { dd: 8, pl: 8 },
        consistency: { dd: 8, pl: 7 },
        errors: { dd: null, pl: null },
        phone: { pl: 6 },
        tidiness: { dd: 6, pl: 8 },
      },
      why: {
        findability:
          'On the phone an entry can only be started from the menu, which one would not guess.',
        tidiness: 'A label runs over the “New entry” button.',
      },
      probe: {
        [FP.overlap]: {
          verdict: 'confirmed',
          why: 'In the close-up the label’s text lies over the button.',
        },
        [FP.nearMiss]: {
          verdict: 'dismissed',
          why: 'A pixel and a half does not show; the paragraphs look straight.',
        },
        [FP.smallMenu]: {
          verdict: 'confirmed',
          why: 'The menu button is clearly smaller than a finger.',
        },
      },
      findings: [
        {
          id: 'F1',
          severity: 'serious',
          criterion: 'tidiness',
          attempt: '1020-090000-dd',
          step: 2,
          shot: 'shots/02-new-entry.marked.png',
          where: 'The middle of the screen, the “New entry” button.',
          text: 'The field label runs over the button; its letters lie on top of it.',
          expected: 'The label above the button, with a gap.',
          fix: 'Move the button below the label, or drop the label.',
          probe: [FP.overlap],
        },
        {
          id: 'F2',
          severity: 'minor',
          criterion: 'phone',
          attempt: '1020-090500-pl',
          step: 2,
          shot: 'shots/02-find-it-in-the-menu.marked.png',
          where: 'The header, the menu button.',
          text: 'The menu button is small; I hit it on the second try.',
          expected: 'A button easy to hit with a finger.',
          fix: 'Make the menu button larger.',
          probe: [FP.smallMenu],
        },
        {
          id: 'F3',
          severity: 'serious',
          criterion: 'findability',
          attempt: '1020-090500-pl',
          step: 2,
          shot: 'shots/02-find-it-in-the-menu.png',
          where:
            'The dashboard on the phone: no “New entry” button on the screen.',
          text: 'I could not find where to start the day’s entry until I opened the menu at random.',
          expected:
            'A “New entry” button right on the dashboard, as on the computer.',
          fix: 'Show “New entry” on the dashboard on the phone too.',
        },
      ],
      previous: [],
      liked: ['The entry was saved at once, and it showed.'],
      filesRead: [
        runRel(join(noviceR1.args.dir, 'brief.md')),
        runRel(
          join(
            nAttempts('1020-090000-dd'),
            'shots/01-open-the-dashboard.marked.png',
          ),
        ),
        runRel(
          join(nAttempts('1020-090000-dd'), 'shots/02-new-entry.marked.png'),
        ),
        runRel(
          join(
            nAttempts('1020-090000-dd'),
            'shots/03-write-and-save.marked.png',
          ),
        ),
        runRel(
          join(nAttempts('1020-090000-dd'), `crops/${cropName(2, FP.overlap)}`),
        ),
        runRel(
          join(
            nAttempts('1020-090500-pl'),
            'shots/01-open-the-dashboard.marked.png',
          ),
        ),
        runRel(
          join(
            nAttempts('1020-090500-pl'),
            'shots/02-find-it-in-the-menu.marked.png',
          ),
        ),
        runRel(
          join(nAttempts('1020-090500-pl'), 'shots/02-find-it-in-the-menu.png'),
        ),
        runRel(
          join(
            nAttempts('1020-090500-pl'),
            'shots/03-write-and-save.marked.png',
          ),
        ),
        runRel(
          join(
            nAttempts('1020-090500-pl'),
            `crops/${cropName(2, FP.smallMenu)}`,
          ),
        ),
      ],
    },
    noviceR1.args.dir,
  );

  const guestR1 = prepare(findGuest.jobId, '2026-10-19T18:30:00.000Z');
  const guestDir = join(studyRoot, 'jobs', findGuest.jobId);
  answer(
    {
      schema: 2,
      job: findGuest.jobId,
      review: 'R1',
      kind: 'fresh',
      attempts: { pl: '1019-180000-pl' },
      overall:
        'I found the project quickly, but its title in the results was cut off, and I was not sure it was the right one.',
      scores: {
        findability: { pl: 8 },
        proximity: { pl: 9 },
        feedback: { pl: 9 },
        control: { pl: 9 },
        wording: { pl: 7 },
        trust: { pl: 8 },
        consistency: { pl: 9 },
        errors: { pl: null },
        phone: { pl: 7 },
        tidiness: { pl: 7 },
      },
      probe: {
        [FP.clipped]: {
          verdict: 'confirmed',
          why: 'The title breaks off mid-word without an ellipsis.',
        },
      },
      findings: [
        {
          id: 'F1',
          severity: 'serious',
          criterion: 'wording',
          attempt: '1019-180000-pl',
          step: 1,
          shot: 'shots/01-find-seedlings.marked.png',
          where: 'The first search result, its heading.',
          text: 'The project’s title is cut mid-word; one cannot tell what it is about.',
          expected: 'The whole title, or one with an ellipsis.',
          fix: 'Wrap a long title onto a second line.',
          probe: [FP.clipped],
        },
      ],
      previous: [],
      liked: ['Search found the project by a single word.'],
      filesRead: [
        runRel(join(guestR1.args.dir, 'brief.md')),
        runRel(
          join(
            guestDir,
            'attempts/1019-180000-pl/shots/01-find-seedlings.marked.png',
          ),
        ),
        runRel(
          join(
            guestDir,
            'attempts/1019-180000-pl/shots/02-open-the-project.marked.png',
          ),
        ),
        runRel(
          join(
            guestDir,
            `attempts/1019-180000-pl/crops/${cropName(1, FP.clipped)}`,
          ),
        ),
      ],
    },
    guestR1.args.dir,
  );

  // The guest's phone, fixed and played again, then rechecked.
  await writeAttempt({
    job: findGuest,
    id: '1020-100000-pl',
    variant: 'pl',
    status: 'done',
    startedAt: '2026-10-20T10:00:00.000Z',
    task: findTask,
    steps: [
      {
        label: 'Find “seedlings”',
        action: 'type',
        url: '/search/?q=seedlings',
        screen: {
          title: 'A greenhouse on the balcony',
          lines: 7,
          button: 'Open',
        },
      },
      {
        label: 'Open the project',
        action: 'tap',
        url: '/projects/greenhouse/',
        target: 'Open',
        screen: { title: 'Greenhouse', lines: 8, button: 'Gallery' },
      },
    ],
  });
  const guestR2 = prepare(findGuest.jobId, '2026-10-20T10:15:00.000Z');
  answer(
    {
      schema: 2,
      job: findGuest.jobId,
      review: 'R2',
      kind: 'recheck',
      attempts: { pl: '1020-100000-pl' },
      overall:
        'Now the whole title shows; the project was found and opened without doubt.',
      scores: {
        findability: { pl: 9 },
        proximity: { pl: 9 },
        feedback: { pl: 9 },
        control: { pl: 9 },
        wording: { pl: 9 },
        trust: { pl: 9 },
        consistency: { pl: 9 },
        errors: { pl: null },
        phone: { pl: 8 },
        tidiness: { pl: 9 },
      },
      probe: {},
      findings: [],
      previous: [
        {
          id: 'R1/F1',
          status: 'fixed',
          why: 'The result’s heading now fits whole.',
          attempt: '1020-100000-pl',
          step: 1,
          shot: 'shots/01-find-seedlings.marked.png',
        },
      ],
      liked: [
        'The project’s large heading.',
        'The gallery swipes with a finger.',
      ],
      filesRead: [
        runRel(join(guestR2.args.dir, 'brief.md')),
        runRel(
          join(
            guestDir,
            'attempts/1020-100000-pl/shots/01-find-seedlings.marked.png',
          ),
        ),
        runRel(
          join(
            guestDir,
            'attempts/1020-100000-pl/shots/02-open-the-project.marked.png',
          ),
        ),
        runRel(
          join(
            guestDir,
            'attempts/1019-180000-pl/shots/01-find-seedlings.marked.png',
          ),
        ),
      ],
    },
    guestR2.args.dir,
  );

  // Since R1: the novice's phone played again after a fix; a computer play failed.
  await writeAttempt({
    job: diaryNovice,
    id: '1020-110000-pl',
    variant: 'pl',
    status: 'done',
    startedAt: '2026-10-20T11:00:00.000Z',
    task: diaryTask,
    steps: [
      {
        label: 'Open the dashboard',
        action: 'open',
        url: '/admin/',
        screen: { title: 'Dashboard', lines: 6, button: 'New entry' },
      },
      {
        label: 'New entry',
        action: 'tap',
        url: '/admin/',
        target: 'New entry',
        screen: { title: 'Dashboard', lines: 6, button: 'New entry' },
        probe: [
          {
            fp: FP.smallMenu,
            rule: 'small-target',
            hint: 'serious',
            box: { x: 327, y: 14, width: 28, height: 28 },
            elements: [{ path: 'header > button', desc: 'button “Menu”' }],
            measure: { smallestSidePx: 28 },
            message:
              'The “Menu” button is 28 px, under the 39 px a finger needs.',
          },
        ],
      },
      {
        label: 'Write and save',
        action: 'fill',
        url: '/admin/diary/2026-10-20/',
        target: 'Entry text',
        screen: editor,
        probe: [
          {
            fp: FP.gap,
            rule: 'uneven-gap',
            hint: 'minor',
            box: { x: 24, y: 196, width: 300, height: 120 },
            elements: [
              { path: 'main > p:nth-child(2)', desc: 'paragraph 2' },
              { path: 'main > p:nth-child(3)', desc: 'paragraph 3' },
            ],
            measure: { gapPx: 14, modePx: 16 },
            message:
              'The gap between paragraphs 2 and 3 is 14 px; the others are 16 px.',
          },
        ],
      },
    ],
  });
  await writeAttempt({
    job: diaryNovice,
    id: '1020-111000-dd',
    variant: 'dd',
    status: 'error',
    startedAt: '2026-10-20T11:10:00.000Z',
    task: diaryTask,
    steps: [
      {
        label: 'Open the dashboard',
        action: 'open',
        url: '/admin/',
        screen: { title: 'Dashboard', lines: 4, button: 'New entry' },
      },
    ],
    pageErrors: [
      'TypeError: Cannot read properties of undefined (reading "uuid")',
    ],
  });

  // The designer: never reviewed; the phone play stopped at the search.
  await writeAttempt({
    job: findDesigner,
    id: '1020-120000-dd',
    variant: 'dd',
    status: 'done',
    startedAt: '2026-10-20T12:00:00.000Z',
    task: findTask,
    steps: [
      {
        label: 'Home',
        action: 'open',
        url: '/',
        screen: { title: 'An archive of a life', lines: 6, button: 'Search' },
      },
      {
        label: 'Find “seedlings”',
        action: 'click',
        url: '/search/?q=seedlings',
        target: 'Search',
        screen: { title: 'Search', lines: 6, button: 'Open' },
        probe: [
          {
            fp: FP.designerNear,
            rule: 'near-miss',
            hint: 'minor',
            box: { x: 160, y: 230, width: 680, height: 20 },
            elements: [
              { path: 'ol > li:nth-child(1)', desc: 'result 1' },
              { path: 'ol > li:nth-child(2)', desc: 'result 2' },
            ],
            measure: { deltaPx: 2 },
            message: 'The left edges of results 1 and 2 differ by 2 px.',
          },
        ],
      },
      {
        label: 'Open the section',
        action: 'click',
        url: '/projects/greenhouse/sections/seedlings/',
        target: 'Open',
        screen: {
          title: 'Seedlings',
          lines: 8,
          button: 'Gallery',
          overlap: true,
        },
        probe: [
          {
            fp: FP.designerOverlap,
            rule: 'overlap',
            hint: 'serious',
            elements: [
              { path: 'figure > figcaption', desc: 'gallery caption' },
              { path: 'figure > button', desc: 'button “Gallery”' },
            ],
            measure: { overlapPx2: 420 },
            message: 'The gallery caption runs over the “Gallery” button.',
          },
        ],
      },
    ],
  });
  await writeAttempt({
    job: findDesigner,
    id: '1020-120500-pl',
    variant: 'pl',
    status: 'stopped',
    startedAt: '2026-10-20T12:05:00.000Z',
    task: findTask,
    steps: [
      {
        label: 'Home',
        action: 'open',
        url: '/',
        screen: { title: 'Archive', lines: 7, button: 'Menu' },
      },
      {
        label: 'Look for search',
        action: 'look',
        url: '/',
        screen: { title: 'Archive', lines: 7, button: 'Menu' },
      },
    ],
    findings: [
      {
        step: 2,
        severity: 'serious',
        kind: 'missing-control',
        text: 'The phone header has no search icon.',
      },
      {
        step: 2,
        severity: 'blocker',
        kind: 'stopped',
        text: 'The task stopped at step 2: search not found within 20 seconds',
      },
    ],
    labNotes: [
      'Outside pictures of the gallery are blocked: the lab’s network does not leave the computer.',
    ],
  });

  // The expert: the computer is played, the phone play was disturbed.
  await writeAttempt({
    job: diaryExpert,
    id: '1020-130000-dd',
    variant: 'dd',
    status: 'done',
    startedAt: '2026-10-20T13:00:00.000Z',
    task: diaryTask,
    steps: [
      {
        label: 'Open the dashboard',
        action: 'open',
        url: '/admin/',
        screen: { title: 'Dashboard', lines: 4, button: 'New entry' },
      },
      {
        label: 'Ctrl+K “today”',
        action: 'press',
        url: '/admin/',
        keys: 9,
        screen: editor,
      },
    ],
  });
  await writeAttempt({
    job: diaryExpert,
    id: '1020-130500-pl',
    variant: 'pl',
    status: 'disturbed',
    startedAt: '2026-10-20T13:05:00.000Z',
    task: diaryTask,
    steps: [
      {
        label: 'Open the dashboard',
        action: 'open',
        url: '/admin/',
        screen: { title: 'Dashboard', lines: 6, button: 'Menu' },
      },
    ],
  });

  writeFileSync(
    join(studyRoot, 'changes.json'),
    `${JSON.stringify(
      [
        {
          at: '2026-10-19T18:40:00.000Z',
          text: 'A search result’s heading wraps onto a second line instead of being cut off.',
          jobs: [findGuest.jobId],
          variants: ['pl'],
          commit: '291db93c',
        },
        {
          at: '2026-10-20T10:40:00.000Z',
          text: '“New entry” moved from the menu onto the dashboard on phones.',
          jobs: [diaryNovice.jobId],
          variants: ['pl'],
          commit: 'c81a2f1f',
        },
      ],
      null,
      2,
    )}\n`,
  );
}

await main();
console.log(`Wrote ${relative(repoRoot, studyRoot)}`);
