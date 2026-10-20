// `report/index.html`: the study's summary as one self-contained page —
// no fonts, scripts or pictures from elsewhere; close-ups are small JPEGs
// inside it. Light and dark follow the system; it works on a phone.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Severity, StudyBar, VariantCode } from '../types';
import {
  criterion as criterionById,
  isCriterion,
  severityLabel,
  variantLabel,
} from './criteria';
import type {
  BarMiss,
  JobSummary,
  StudySummary,
  SummaryFinding,
} from './aggregate';
import { ruleLabel } from './brief';
import { isFile } from './runs';

/** Pictures by their file, as data URIs. */
export type Thumbnails = Map<string, string>;

const SERIOUS: Severity[] = ['blocker', 'serious'];

async function thumbnail(file: string, width: number): Promise<string> {
  const data = await sharp(file)
    .resize({ width, withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${data.toString('base64')}`;
}

/** Close-ups of the serious findings, or their screenshot when the probe drew none. */
export async function makeThumbnails(
  summary: StudySummary,
): Promise<Thumbnails> {
  const thumbnails: Thumbnails = new Map();
  for (const finding of summary.findings) {
    if (!SERIOUS.includes(finding.severity)) continue;
    const files = finding.crops.length
      ? finding.crops.slice(0, 3).map((file) => [file, 320] as const)
      : finding.shot
        ? [[finding.shot, 480] as const]
        : [];
    for (const [file, width] of files)
      if (!thumbnails.has(file) && isFile(file))
        thumbnails.set(file, await thumbnail(file, width));
  }
  return thumbnails;
}

function esc(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function num(value: number | undefined): string {
  return value === undefined
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function when(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return esc(iso);
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function duration(ms: number): string {
  return ms >= 60_000
    ? `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
    : `${num(Math.round(ms / 100) / 10)} s`;
}

function label(id: string): string {
  return isCriterion(id) ? criterionById(id).label : id;
}

const STATE: Record<JobSummary['state'], [string, string]> = {
  unplayed: ['not played', 'muted'],
  partial: ['not every screen', 'warn'],
  waiting: ['waits for a review', 'warn'],
  reviewed: ['reviewed', 'ok'],
};

const STATUS: Record<SummaryFinding['status'], string> = {
  new: 'new',
  still: 'still',
  worse: 'worse',
  unclear: 'unclear',
};

const ATTEMPT: Record<string, [string, string]> = {
  done: ['done', 'ok'],
  stopped: ['stopped', 'warn'],
  error: ['error', 'bad'],
  disturbed: ['code changed', 'bad'],
};

function chip(text: string, tone = ''): string {
  return `<span class="chip${tone ? ` ${tone}` : ''}">${esc(text)}</span>`;
}

function severityChip(severity: Severity): string {
  const tone =
    severity === 'blocker' || severity === 'serious'
      ? 'bad'
      : severity === 'minor'
        ? 'warn'
        : 'muted';
  return chip(severityLabel(severity), tone);
}

export function missText(miss: BarMiss, bar: StudyBar): string {
  switch (miss.kind) {
    case 'unplayed':
      return 'not played';
    case 'partial':
      return `not played on ${miss.variants.join(', ')}`;
    case 'waiting':
      return 'waits for a review: its plays are newer than the last review saw';
    case 'low':
      return `below ${bar.minScore}: ${miss.scores
        .map((s) => `${label(s.criterion)} ${s.variant} ${s.score}`)
        .join(', ')}`;
    case 'mean':
      return `mean ${num(miss.mean)} below ${num(bar.minMean)}`;
    case 'open':
      return `open ${severityLabel(miss.severity)}: ${miss.count}`;
  }
}

function tone(score: number, bar: StudyBar): string {
  return score >= bar.minScore
    ? 'ok'
    : score >= bar.minScore - 2
      ? 'warn'
      : 'bad';
}

/** A mean is held to the bar's mean. */
function meanTone(mean: number, bar: StudyBar): string {
  return mean >= bar.minMean ? 'ok' : mean >= bar.minMean - 2 ? 'warn' : 'bad';
}

function barSection(summary: StudySummary): string {
  const { bar, counts } = summary;
  const open = summary.findings.filter((f) => SERIOUS.includes(f.severity));
  const misses = summary.jobs.filter((job) => job.bar.length);
  const tiles: [string, string, string?][] = [
    ['Jobs', String(counts.jobs)],
    [
      'Reviewed',
      String(counts.reviewed),
      counts.reviewed === counts.jobs ? 'ok' : undefined,
    ],
    ['Waiting', String(counts.waiting), counts.waiting ? 'warn' : undefined],
    [
      'Not played',
      String(counts.partial + counts.unplayed),
      counts.partial + counts.unplayed ? 'warn' : undefined,
    ],
    [
      'Mean',
      num(summary.mean),
      summary.mean !== undefined ? meanTone(summary.mean, bar) : undefined,
    ],
    [
      'Lowest score',
      num(summary.min),
      summary.min !== undefined ? tone(summary.min, bar) : undefined,
    ],
    ['Serious findings', String(open.length), open.length ? 'bad' : 'ok'],
  ];
  return `
<section class="bar ${bar.met ? 'met' : 'missed'}" aria-labelledby="bar-title">
  <div class="bar-head">
    <span class="mark" aria-hidden="true">${bar.met ? '✓' : '✗'}</span>
    <div>
      <h2 id="bar-title">${bar.met ? 'The bar is met' : 'The bar is not met'}</h2>
      <p class="rule">Every score at least ${num(bar.minScore)}, each job's mean at least ${num(
        bar.minMean,
      )}, ${
        bar.forbid.length
          ? `no open ${bar.forbid.map((s) => severityLabel(s)).join(' or ')} findings`
          : 'findings of any severity allowed'
      }.</p>
    </div>
  </div>
  ${
    misses.length
      ? `<ul class="misses">${misses
          .map(
            (job) =>
              `<li><a href="#job-${esc(job.jobId)}">${esc(job.scenarioTitle)} · ${esc(
                job.personaName,
              )}</a><span>${job.bar.map((miss) => esc(missText(miss, bar))).join('; ')}</span></li>`,
          )
          .join('')}</ul>`
      : ''
  }
  <dl class="tiles">${tiles
    .map(
      ([name, value, t]) =>
        `<div class="tile${t ? ` ${t}` : ''}"><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`,
    )
    .join('')}</dl>
</section>`;
}

function scoreCell(job: JobSummary, id: string, bar: StudyBar): string {
  const variants = job.criteria[id];
  if (!variants) return '<td class="na" title="Not judged in this job">—</td>';
  const scores = job.latest?.scores[id];
  if (!job.latest) return '<td class="none"></td>';
  if (!scores) return '<td class="none">·</td>';
  const values = variants
    .map((variant) => [variant, scores[variant]] as const)
    .filter(
      (entry): entry is readonly [VariantCode, number] =>
        typeof entry[1] === 'number',
    );
  const title = variants
    .map((variant) => `${variant}: ${scores[variant] ?? 'untouched'}`)
    .join(' · ');
  if (!values.length) return `<td class="none" title="${esc(title)}">·</td>`;
  const [worstVariant, worst] = values.reduce((a, b) => (b[1] < a[1] ? b : a));
  const differs = values.some(([, value]) => value !== worst);
  return `<td class="score ${tone(worst, bar)}" title="${esc(title)}"><b>${worst}</b>${
    differs ? `<small>${worstVariant}</small>` : ''
  }</td>`;
}

function matrixSection(summary: StudySummary): string {
  if (!summary.jobs.length) return '';
  const tables = (['persona', 'designer'] as const)
    .map((lens) => {
      const jobs = summary.jobs.filter((job) => job.lens === lens);
      if (!jobs.length) return '';
      const columns = summary.criteria.filter((c) =>
        jobs.some((job) => job.criteria[c.id]),
      );
      return `
<h3>${lens === 'designer' ? 'Designer lens' : 'Persona lens'}</h3>
<div class="scroll" role="region" aria-label="${lens === 'designer' ? 'Designer scores' : 'Persona scores'}" tabindex="0">
<table class="matrix">
  <thead><tr><th scope="col" class="who">Job</th><th scope="col" class="rev">Review</th><th scope="col" class="mean">Mean</th>${columns
    .map(
      (c) => `<th scope="col" class="crit"><span>${esc(c.label)}</span></th>`,
    )
    .join('')}</tr></thead>
  <tbody>${jobs
    .map((job) => {
      const latest = job.latest;
      return `<tr class="${latest && !latest.current ? 'stale' : ''}">
  <th scope="row" class="who"><a href="#job-${esc(job.jobId)}">${esc(job.scenarioTitle)}</a><span>${esc(
    job.personaName,
  )} · ${job.variants.join(', ')}</span></th>
  <td class="rev">${
    latest
      ? `${esc(latest.review)}${latest.current ? '' : `<small>stale</small>`}`
      : chip(STATE[job.state][0], STATE[job.state][1])
  }</td>
  <td class="mean score ${latest?.mean !== undefined ? meanTone(latest.mean, summary.bar) : 'none'}">${
    latest?.mean !== undefined ? `<b>${num(latest.mean)}</b>` : '·'
  }</td>
  ${columns.map((c) => scoreCell(job, c.id, summary.bar)).join('')}
</tr>`;
    })
    .join('')}</tbody>
</table>
</div>`;
    })
    .join('');
  return `
<section aria-labelledby="matrix-title">
  <h2 id="matrix-title">Scores of the latest reviews</h2>
  <p class="note">A cell holds the criterion's lowest score across screens, with the screen when they differ; every score is in its tooltip. “·” means the steps never touched it, “—” that the criterion is not for this job. A stale review did not see the latest plays.</p>
  ${tables}
</section>`;
}

function findingCard(
  finding: SummaryFinding,
  summary: StudySummary,
  thumbnails: Thumbnails,
): string {
  const job = summary.jobs.find((j) => j.jobId === finding.job);
  const pictures = (
    finding.crops.length
      ? finding.crops.slice(0, 3)
      : finding.shot
        ? [finding.shot]
        : []
  )
    .map((file) => thumbnails.get(file))
    .filter((src): src is string => !!src);
  return `
<article class="finding">
  <header>
    ${severityChip(finding.severity)}
    ${finding.status !== 'new' ? chip(STATUS[finding.status], finding.status === 'worse' ? 'bad' : 'muted') : ''}
    <span class="key">${esc(finding.key)}</span>
  </header>
  <h3>${esc(finding.text)}</h3>
  <p class="where">${esc(job ? `${job.scenarioTitle} · ${job.personaName}` : finding.job)} · ${esc(
    label(finding.criterion),
  )} · ${finding.variant ? esc(variantLabel(finding.variant)) : esc(finding.attempt)} · step ${finding.step}</p>
  ${
    pictures.length
      ? `<div class="pictures${finding.crops.length ? '' : ' shot'}">${pictures
          .map(
            (src) =>
              `<img src="${src}" alt="${esc(finding.crops.length ? 'Close-up of this finding' : 'Screenshot of this finding')}" loading="lazy">`,
          )
          .join('')}</div>`
      : ''
  }
  <dl>
    <dt>Where</dt><dd>${esc(finding.where)}</dd>
    <dt>Expected</dt><dd>${esc(finding.expected)}</dd>
    <dt>Fix</dt><dd>${esc(finding.fix)}</dd>
  </dl>
  ${
    finding.probe.length
      ? `<p class="fps">Probe: ${finding.probe.map((fp) => `<code>${esc(fp)}</code>`).join(' ')}</p>`
      : ''
  }
</article>`;
}

function findingsSection(
  summary: StudySummary,
  thumbnails: Thumbnails,
): string {
  const serious = summary.findings.filter((f) => SERIOUS.includes(f.severity));
  const rest = summary.findings.filter((f) => !SERIOUS.includes(f.severity));
  return `
<section aria-labelledby="findings-title">
  <h2 id="findings-title">Serious findings</h2>
  ${
    serious.length
      ? `<div class="findings">${serious.map((f) => findingCard(f, summary, thumbnails)).join('')}</div>`
      : '<p class="empty">No blocker or serious findings are open.</p>'
  }
  ${
    rest.length
      ? `<details class="rest">
  <summary>Other open findings: ${rest.length}</summary>
  <ul>${rest
    .map(
      (f) =>
        `<li>${severityChip(f.severity)}${
          f.status !== 'new' ? ` ${chip(STATUS[f.status], 'muted')}` : ''
        } <span class="key">${esc(f.key)}</span> ${esc(f.text)} <span class="where">${esc(f.job)} · ${esc(
          label(f.criterion),
        )} · ${esc(f.variant ?? f.attempt)} · step ${f.step}</span></li>`,
    )
    .join('')}</ul>
</details>`
      : ''
  }
</section>`;
}

function counts(
  record: Partial<Record<string, number>>,
  labels: Record<string, string>,
): string {
  const parts = Object.entries(labels)
    .filter(([key]) => record[key])
    .map(([key, name]) => `${name} ${record[key]}`);
  return parts.length ? esc(parts.join(', ')) : '—';
}

const SEVERITY_SHORT: Record<string, string> = {
  blocker: 'blocker',
  serious: 'serious',
  minor: 'minor',
  taste: 'taste',
};

function jobSection(job: JobSummary, summary: StudySummary): string {
  const latest = job.latest;
  const [stateText, stateTone] = STATE[job.state];
  return `
<details class="job" id="job-${esc(job.jobId)}"${job.bar.length ? ' open' : ''}>
  <summary>
    <span class="title">${esc(job.scenarioTitle)} · ${esc(job.personaName)}</span>
    ${chip(stateText, stateTone)}
    ${job.bar.length ? '' : chip('bar met', 'ok')}
  </summary>
  <div class="job-body">
    <p class="meta"><code>${esc(job.jobId)}</code> · ${job.variants
      .map((v) => esc(variantLabel(v)))
      .join(
        '; ',
      )}${job.state === 'waiting' ? ` · next review: ${job.next === 'recheck' ? 'a recheck' : 'fresh'}` : ''}</p>
    ${
      job.bar.length
        ? `<ul class="misses">${job.bar.map((miss) => `<li>${esc(missText(miss, summary.bar))}</li>`).join('')}</ul>`
        : ''
    }
    ${
      latest
        ? `<blockquote>${esc(latest.overall)}<cite>${esc(latest.review)}, ${
            latest.kind === 'recheck' ? 'recheck' : 'fresh review'
          }</cite></blockquote>
    ${
      Object.keys(latest.why).length
        ? `<details class="why"><summary>Why these scores</summary><dl>${Object.entries(
            latest.why,
          )
            .map(
              ([id, text]) => `<dt>${esc(label(id))}</dt><dd>${esc(text)}</dd>`,
            )
            .join('')}</dl></details>`
        : ''
    }
    ${latest.liked.length ? `<p class="liked"><b>Liked:</b> ${latest.liked.map(esc).join('; ')}</p>` : ''}`
        : ''
    }
    <h4>Reviews</h4>
    ${
      job.reviews.length
        ? `<div class="scroll" tabindex="0"><table class="list">
      <thead><tr><th>Review</th><th>Kind</th><th>Attempts</th><th class="num">Mean</th><th class="num">Lowest</th><th>New findings</th><th>Earlier</th><th>Probe</th></tr></thead>
      <tbody>${job.reviews
        .map(
          (r) => `<tr class="${r.answered && !r.valid ? 'invalid' : ''}">
        <td>${esc(r.review)}${r.preparedAt ? `<small>${when(r.preparedAt)}</small>` : ''}</td>
        <td>${
          !r.answered
            ? chip('no answer yet', 'warn')
            : !r.valid
              ? `${chip('invalid answer', 'bad')}<small>${esc(r.errors.slice(0, 3).join('; '))}${r.errors.length > 3 ? ' …' : ''}</small>`
              : r.kind === 'recheck'
                ? `recheck of ${esc(r.base ?? '')}`
                : 'fresh'
        }</td>
        <td>${
          Object.entries(r.attempts)
            .map(
              ([v, id]) =>
                `<span class="nw"><code>${esc(v)}</code> ${esc(id)}</span>`,
            )
            .join('<br>') || '—'
        }</td>
        <td class="num">${num(r.mean)}</td>
        <td class="num">${num(r.min)}</td>
        <td>${counts(r.found, SEVERITY_SHORT)}</td>
        <td>${counts(r.previous, { fixed: 'fixed', still: 'still', worse: 'worse', unclear: 'unclear' })}</td>
        <td>${counts(r.verdicts, { confirmed: 'confirmed', dismissed: 'dismissed', unsure: 'unsure' })}</td>
      </tr>`,
        )
        .join('')}</tbody></table></div>`
        : '<p class="empty">No reviews yet.</p>'
    }
    <h4>Attempts</h4>
    ${
      job.attempts.length
        ? `<div class="scroll" tabindex="0"><table class="list">
      <thead><tr><th>Attempt</th><th>Screen</th><th>Outcome</th><th class="num">Steps</th><th class="num">Time</th><th class="num">Page errors</th><th>Left after tidying</th></tr></thead>
      <tbody>${[...job.attempts]
        .reverse()
        .map((a) => {
          const [text, t] = ATTEMPT[a.status] ?? [a.status, 'muted'];
          return `<tr class="${a.inSet ? 'in-set' : ''}">
        <td><code>${esc(a.id)}</code>${a.inSet ? '<small>in the review set</small>' : ''}</td>
        <td>${esc(a.variant)}</td>
        <td>${chip(text, t)}</td>
        <td class="num">${a.steps}</td>
        <td class="num">${duration(a.durationMs)}${a.serverMode === 'dev' ? '<small>dev</small>' : ''}</td>
        <td class="num">${a.pageErrors + a.consoleErrors || '—'}</td>
        <td>${a.leftovers.length ? esc(a.leftovers.join(', ')) : '—'}</td>
      </tr>`;
        })
        .join('')}</tbody></table></div>`
        : '<p class="empty">No attempts.</p>'
    }
  </div>
</details>`;
}

function probeSection(summary: StudySummary): string {
  return `
<section aria-labelledby="probe-title">
  <h2 id="probe-title">Probe precision</h2>
  <p class="note">By the latest verdict on each fingerprint. A rule under 50% on 30 or more verdicts should be lowered to info.</p>
  ${
    summary.probe.length
      ? `<div class="scroll" tabindex="0"><table class="list">
    <thead><tr><th>Rule</th><th class="num">Confirmed</th><th class="num">Dismissed</th><th class="num">Unsure</th><th class="num">Precision</th></tr></thead>
    <tbody>${summary.probe
      .map(
        (p) => `<tr>
      <td>${esc(ruleLabel(p.rule))} <code>${esc(p.rule)}</code></td>
      <td class="num">${p.confirmed}</td>
      <td class="num">${p.dismissed}</td>
      <td class="num">${p.unsure}</td>
      <td class="num">${p.precision === undefined ? '—' : `${Math.round(p.precision * 100)}%`}${
        p.demote ? ` ${chip('lower to info', 'bad')}` : ''
      }</td>
    </tr>`,
      )
      .join('')}</tbody></table></div>`
      : '<p class="empty">No verdicts on the probe yet.</p>'
  }
</section>`;
}

function changesSection(summary: StudySummary): string {
  if (!summary.changes.length) return '';
  return `
<section aria-labelledby="changes-title">
  <h2 id="changes-title">Changes</h2>
  <ol class="changes">${summary.changes
    .map(
      (c) =>
        `<li>${c.at ? `<time>${when(c.at)}</time>` : ''}<span>${esc(c.text)}${
          c.jobs?.length || c.variants?.length || c.commit
            ? `<small>${[
                ...(c.jobs ?? []),
                ...(c.variants ?? []),
                ...(c.commit ? [c.commit.slice(0, 8)] : []),
              ]
                .map(esc)
                .join(' · ')}</small>`
            : ''
        }</span></li>`,
    )
    .join('')}</ol>
</section>`;
}

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f5f5f2; --surface: #ffffff; --surface-2: #efeeea; --line: #e1e0da;
  --text: #1c1c1a; --muted: #67665f; --accent: #2a62c9;
  --ok: #1d6f39; --ok-bg: #e2f2e6; --warn: #845400; --warn-bg: #faefd6;
  --bad: #b0261d; --bad-bg: #fbe3df; --chip: #ebeae5;
  --radius: 10px; --gap: 16px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px; line-height: 1.5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141413; --surface: #1d1d1b; --surface-2: #262623; --line: #33322e;
    --text: #eceae4; --muted: #a3a199; --accent: #85adff;
    --ok: #86d6a0; --ok-bg: #1b3123; --warn: #f0c46a; --warn-bg: #362b14;
    --bad: #ff8f85; --bad-bg: #3b1d1a; --chip: #2c2b28;
  }
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--text); -webkit-text-size-adjust: 100%; }
body { margin: 0; padding: 32px 24px 64px; }
.page { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible, summary:focus-visible, .scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
h1, h2, h3, h4 { margin: 0; line-height: 1.25; font-weight: 650; }
h1 { font-size: 28px; }
h2 { font-size: 20px; margin-bottom: 12px; }
h3 { font-size: 16px; }
h4 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 20px 0 8px; }
p { margin: 0; }
code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: .88em; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; }
.eyebrow { color: var(--muted); font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
.top { display: grid; gap: 6px; }
.question { font-size: 17px; max-width: 70ch; }
.meta, .note { color: var(--muted); font-size: 13px; }
.note { margin-bottom: 12px; max-width: 80ch; }
.empty { color: var(--muted); }
.chip { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--chip); font-size: 12px; font-weight: 550; white-space: nowrap; vertical-align: 1px; }
.chip.ok { background: var(--ok-bg); color: var(--ok); }
.chip.warn { background: var(--warn-bg); color: var(--warn); }
.chip.bad { background: var(--bad-bg); color: var(--bad); }
.chip.muted { color: var(--muted); }

.bar { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; display: grid; gap: 16px; }
.bar-head { display: flex; gap: 14px; align-items: flex-start; }
.bar h2 { margin: 0 0 4px; }
.mark { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 18px; }
.met .mark { background: var(--ok-bg); color: var(--ok); }
.missed .mark { background: var(--bad-bg); color: var(--bad); }
.rule { color: var(--muted); }
.misses { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.misses li { display: grid; grid-template-columns: minmax(0, 16rem) minmax(0, 1fr); gap: 12px; }
.job-body .misses li { display: list-item; list-style: disc inside; color: var(--bad); }
.misses span { color: var(--muted); }
.tiles { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.tile { background: var(--surface-2); border-radius: 8px; padding: 10px 12px; }
.tile dt { color: var(--muted); font-size: 12px; }
.tile dd { margin: 2px 0 0; font-size: 22px; font-weight: 650; font-variant-numeric: tabular-nums; }
.tile.ok dd { color: var(--ok); }
.tile.warn dd { color: var(--warn); }
.tile.bad dd { color: var(--bad); }

h3 + .scroll, .scroll + h3 { margin-top: 8px; }
section > h3 { margin: 16px 0 8px; }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
table { border-collapse: separate; border-spacing: 0; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 8px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
tbody tr:last-child > * { border-bottom: 0; }
thead th { font-size: 12px; font-weight: 600; color: var(--muted); background: var(--surface-2); vertical-align: bottom; }
.matrix th.crit { width: 44px; min-width: 44px; padding: 10px 0 8px; vertical-align: bottom; text-align: center; }
.matrix th.crit span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; text-align: left; line-height: 1.2; }
.matrix .who { position: sticky; left: 0; z-index: 1; background: var(--surface); box-shadow: inset -1px 0 0 var(--line); width: 100%; min-width: 180px; font-weight: 600; }
.matrix .rev, .matrix .mean { width: 72px; min-width: 72px; }
.matrix thead .who { background: var(--surface-2); }
.matrix .who span { display: block; color: var(--muted); font-weight: 400; font-size: 12px; }
.matrix td { text-align: center; white-space: nowrap; }
.matrix td.rev { text-align: left; }
.score b { font-size: 15px; }
.score small { display: inline; margin-left: 3px; }
.score.ok { background: var(--ok-bg); color: var(--ok); }
.score.warn { background: var(--warn-bg); color: var(--warn); }
.score.bad { background: var(--bad-bg); color: var(--bad); }
.none, .na { color: var(--muted); }
.stale > :not(.who) { opacity: .55; }

.findings { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--gap); }
.finding { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: grid; gap: 10px; align-content: start; min-width: 0; }
.finding header { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.key { color: var(--muted); font-size: 12px; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
.finding header .key { margin-left: auto; }
.finding .where, .rest .where { color: var(--muted); font-size: 13px; }
.pictures { display: flex; gap: 8px; overflow-x: auto; }
.pictures img { display: block; height: 120px; width: auto; max-width: 100%; border-radius: 6px; border: 1px solid var(--line); object-fit: contain; background: var(--surface-2); }
.pictures.shot img { height: 220px; }
.finding dl { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; font-size: 14px; }
.finding dt { color: var(--muted); }
.finding dd { margin: 0; }
.fps { font-size: 12px; color: var(--muted); }
.rest { margin-top: var(--gap); }
.rest summary, .job summary { cursor: pointer; }
.rest ul { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.rest li { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.rest li .where { display: block; }

.jobs { display: grid; gap: 10px; }
.job { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.job > summary { padding: 14px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; list-style: none; }
.job > summary::-webkit-details-marker { display: none; }
.job > summary::before { content: "▸"; color: var(--muted); width: 12px; flex: none; }
.job[open] > summary::before { content: "▾"; }
.job .title { font-weight: 600; margin-right: auto; }
.job-body { padding: 0 16px 16px; display: grid; gap: 10px; min-width: 0; }
.job-body h4 { margin-bottom: 0; }
.job-body .scroll { background: var(--surface); }
blockquote { margin: 0; padding: 10px 14px; border-left: 3px solid var(--accent); background: var(--surface-2); border-radius: 0 8px 8px 0; }
blockquote cite { display: block; color: var(--muted); font-style: normal; font-size: 12px; margin-top: 4px; }
.why summary { color: var(--accent); cursor: pointer; font-size: 14px; }
.why dl { margin: 8px 0 0; display: grid; grid-template-columns: minmax(0, 12rem) minmax(0, 1fr); gap: 4px 12px; font-size: 14px; }
.why dt { color: var(--muted); }
.why dd { margin: 0; }
.liked { font-size: 14px; }
.list td, .list th { font-size: 13px; }
.list code, .matrix small, .chip, .nw { white-space: nowrap; }
.list .num { text-align: right; white-space: nowrap; }
.list tr.invalid td { background: var(--bad-bg); }
.list tr.in-set td:first-child code { font-weight: 700; }

.changes { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.changes li { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.changes time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; }

@media (max-width: 640px) {
  :root { font-size: 14px; }
  body { padding: 20px 16px 48px; }
  .page { gap: 24px; }
  h1 { font-size: 22px; }
  .question { font-size: 15px; }
  .bar { padding: 16px; }
  .misses li { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tile:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .findings { grid-template-columns: minmax(0, 1fr); }
  .matrix .who { min-width: 136px; }
  .why dl { grid-template-columns: minmax(0, 1fr); }
  .why dd { margin-bottom: 6px; }
  .changes li { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
`;

export function renderReport(
  summary: StudySummary,
  thumbnails: Thumbnails,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(summary.study.title)} · lab</title>
<style>${STYLE}</style>
</head>
<body>
<div class="page">
<header class="top">
  <p class="eyebrow">Study <code>${esc(summary.study.id)}</code></p>
  <h1>${esc(summary.study.title)}</h1>
  <p class="question">${esc(summary.study.question)}</p>
  <p class="meta">Made ${when(summary.generatedAt)}</p>
</header>
<main class="page">
${barSection(summary)}
${matrixSection(summary)}
${findingsSection(summary, thumbnails)}
<section aria-labelledby="jobs-title">
  <h2 id="jobs-title">Jobs</h2>
  <div class="jobs">${summary.jobs.map((job) => jobSection(job, summary)).join('')}</div>
</section>
${probeSection(summary)}
${changesSection(summary)}
</main>
</div>
</body>
</html>
`;
}

/** Writes `report/summary.json` and `report/index.html`; returns the page's path. */
export async function writeReport(
  dir: string,
  summary: StudySummary,
): Promise<string> {
  const folder = join(dir, 'report');
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  const page = join(folder, 'index.html');
  writeFileSync(page, renderReport(summary, await makeThumbnails(summary)));
  return page;
}
