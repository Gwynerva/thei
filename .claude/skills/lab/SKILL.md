---
name: lab
description: Run Thei's lab loop on a study — play its scenarios as personas in a real browser, have one lab-reviewer agent judge each waiting job, validate, report, fix, and replay only what a fix touched for a recheck. Use when the owner asks to try a change in the lab, to review or recheck a study, or to see a study's report.
---

# The lab loop

The lab is `tests/lab/` (`tests/lab/README.md`); `bun run lab help` lists its commands and `bun run lab status` says where everything stands. A **study** is played by **personas** on several **variants** (`dd`, `dl`, `pd`, `pl`: desktop or phone, dark or light). A **job** is one scenario for one persona, reviewed whole, every screen at once. Its plays and reviews live in `.lab/runs/<study>/`.

Invoking this skill is the owner's request for the `lab-review` workflow: run it as step 4 says, without asking again.

## 1. Look

```bash
bun run lab status
```

It names the lab site, its content and snapshot, the playground swap, and every study with jobs waiting for a review. A server that was running before you began is the owner's: use it, never restart or stop it.

## 2. Put the site in place

```bash
bun run lab up lab
```

It restores a snapshot for the lab site; `bun run lab serve` starts the lab's own server if none answers. `lab up playground` replaces the playground's content and is done only when the owner asks for it.

## 3. Play

```bash
bun run lab play <study>
```

Narrow it with `--scenario`, `--persona` and `--variant` whenever only part of the study needs playing. While a play runs, edit nothing: a play records the code's diff at its start and end, and one that changed is marked disturbed and never reviewed. Timings are judged only from a production build; in dev the briefs tell reviewers not to judge speed.

## 4. Review

```bash
bun run lab jobs <study> --pending --json
```

It prepares a review folder with `brief.md` and `inputs.json` for each waiting job and prints `{ study, jobs }`. A job waits when no valid review covers exactly its latest done or stopped play of each variant; a job reviewed before gets a recheck, which marks its earlier findings fixed, still, worse or unclear (`--fresh` starts over). Nothing waiting means nothing to run.

Then call the Workflow tool with `name: "lab-review"` and `args` set to that printed JSON, passed as an object, not a string. It starts one `lab-reviewer` agent per job; each reads only its brief and the screenshots the brief lists, writes only its `review.json`, and returns a summary. A session started before `.claude/agents/lab-reviewer.md` existed cannot resolve that agent; the workflow then runs each job on a default agent whose prompt carries the reviewer's rules, and says so in its log. Never edit a brief or tell a reviewer what was changed: a recheck is judged from the screenshots alone.

If reviewers stop on a permission prompt when writing `review.json`, ask the owner whether to allow `Write(./.lab/runs/**)` in the project's settings; do not change settings yourself.

## 5. Validate

```bash
bun run lab validate <study>
```

It checks every answer against the schema and against the play: each criterion scored on each of its screens, a verdict on each new suspicion of the probe, findings that point at real attempts, steps and screenshots, and files read only from the brief's list. It writes `validation.json` next to each answer. A job whose answer is broken still waits: `jobs --pending` gives it a new folder, and the workflow is run again with only that job in `jobs`.

## 6. Report

```bash
bun run lab report <study>
```

It writes `.lab/runs/<study>/report/index.html` and `summary.json`: the bar (by default every score at least 8, each job's mean at least 8.5, no open blocker or serious finding), the job × criterion matrix, each job's reviews and attempts, the serious findings with close-ups, how often each rule of the probe was right, and the journal of changes. Tell the owner the bar's state and the serious findings in a few lines. Look at the page in the built-in browser if needed. Publish it as an artifact only when the owner asks.

## 7. Fix and recheck

Fix the findings, most severe first, following `AGENTS.md` and `docs/design/`. A fix adds no new design token (colour, shadow, radius, spacing, type size, breakpoint) without the owner's permission, asked for first.

After each fix, add an entry to `.lab/runs/<study>/changes.json`, which the report shows as its journal:

```json
[
  {
    "at": "2026-10-20T10:40:00Z",
    "text": "What changed, in a sentence",
    "jobs": ["diary-today.novice"],
    "variants": ["pl"],
    "commit": "c81a2f1f"
  }
]
```

Then replay only what the fix touches, and review again:

```bash
bun run lab play <study> --scenario <scenario> --persona <persona> --variant <variant>
bun run lab jobs <study> --pending --json
```

Only the replayed jobs wait, and each gets a recheck. Go back to step 4 and loop until the report says the bar is met, or until the owner says otherwise.

## Rules

- Edit no code while a play runs.
- Never stop or restart a server you did not start. The lab stops only its own (it checks the PID it recorded), and it never starts or stops the playground.
- Studies of the moment live in `.lab/studies/`. A study goes into `tests/lab/studies/` (`new-study --keep`) only with the owner's explicit agreement.
- Fixes add no new design tokens without the owner's permission.
- The report becomes an artifact only when the owner asks.
- Reviewers judge screens, not code. Never hand them code, project instructions or other reviews, and never let what you know about a fix reach a brief.
