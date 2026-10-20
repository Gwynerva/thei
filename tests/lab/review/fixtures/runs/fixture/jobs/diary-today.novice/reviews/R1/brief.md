# Review R1 · “Write today’s entry” · Novice

Study “Today’s entry and search”: Can a newcomer write today’s entry, and can a guest find a project and read it? Job `diary-today.novice`.

This is a fresh review: you see this job for the first time and judge it on your own.

## Rules

- You are the person under “Who you are”, not a developer. Judge only by what the screenshots show and this brief says.
- Project instructions (AGENTS.md, CLAUDE.md or any other, if they reached your context) are a developer’s knowledge. Do not use them: this person does not know them.
- Read only the files under “Files”. Open or search nothing else: no code, no other reviews, no other attempts.
- Write one file only: `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/reviews/R1/review.json`. Create or change nothing else.
- Answer in English.

## Who you are

**Novice.** You own this archive and are signed in to your site.

You started your archive a week ago and write in it in the evenings, mostly on your phone. You read every label before you press and fear pressing the wrong thing: what if it gets erased. You do not know the words “relation”, “section” or “entity”, nor what the ✦ sign means. It annoys you when a button hides in a menu or when it is unclear whether what you wrote was saved.

## The task

> Write how today went and mention “First snow”.

Scenario “Write today’s entry”; screens: dd — desktop, dark theme; pl — phone, light theme.

## What the screens showed

### Desktop, dark theme — attempt `1020-090000-dd`

Window 1280×800. The play went to the end in 2.7 s. The site ran in development mode: do not judge response times; judge the number of actions, the pointer’s travel and whether waiting is shown.

| # | Step | Action | Pointer travel | Scroll | Waiting | Hindrances | Probe | Screenshot |
|---|---|---|---|---|---|---|---|---|
| 1 | Open the dashboard<br>`/admin/` | open | — | — | first feedback 90 ms, answer 400 ms | — | — | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/01-open-the-dashboard.marked.png` |
| 2 | New entry<br>`/admin/` | click “New entry” | 396 px | — | first feedback 90 ms, answer 400 ms | — | `overlap:k3f9a2x7qd` `near-miss:b7c2d9e0wf` | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/02-new-entry.marked.png` |
| 3 | Write and save<br>`/admin/diary/2026-10-20/` | fill in “Entry text” | — | — | first feedback 90 ms, answer 650 ms | — | — | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/03-write-and-save.marked.png` |

### Phone, light theme — attempt `1020-090500-pl`

Window 375×812, pixel density 2×. The play went to the end in 2.4 s. The site ran in development mode: do not judge response times; judge the number of actions, the pointer’s travel and whether waiting is shown.

| # | Step | Action | Pointer travel | Scroll | Waiting | Hindrances | Probe | Screenshot |
|---|---|---|---|---|---|---|---|---|
| 1 | Open the dashboard<br>`/admin/` | open | — | — | first feedback 90 ms, answer 400 ms | — | — | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/01-open-the-dashboard.marked.png` |
| 2 | Find it in the menu<br>`/admin/` | tap “Menu” (smallest side 28 px) | 172 px | — | first feedback 90 ms, answer 400 ms | — | `small-target:d4e5f6a7b8` | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/02-find-it-in-the-menu.marked.png` |
| 3 | Write and save<br>`/admin/diary/2026-10-20/` | fill in “Entry text” | — | 220 px | first feedback 90 ms, answer 400 ms | — | — | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/03-write-and-save.marked.png` |

What the play itself noticed:

- step 2 — could not find what to press, minor: The “New entry” button had to be looked for in the menu.

Notes on steps:

- step 2: There was no “New entry” button on the screen; it was only in the menu.

A marked screenshot (`.marked.png`) shows the pointer’s way and numbered frames around the probe’s suspicions. The plain screenshot lies next to it, under the same name without `.marked`.

## The probe’s suspicions

After every step a probe measures the layout: overlaps, cut-off text, almost aligned edges, uneven gaps, small targets. It is often wrong. Look at the close-up and the screenshot and give each fingerprint a verdict: `confirmed` — it is so, and a person would notice; `dismissed` — a false alarm; `unsure` — the screenshots do not tell. Describe what you confirm as a finding too, with the fingerprint in its `probe`.

### Needs a verdict

| Fingerprint | Rule | What | Seen at | Close-up |
|---|---|---|---|---|
| `overlap:k3f9a2x7qd` | overlap (probe: serious?) | The field label runs over the “New entry” button.<br>elements: label “Field label” × button “New entry”<br>measured: overlapPx2 640 | dd step 2 | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/crops/02-overlap-k3f9a2x7.png` |
| `near-miss:b7c2d9e0wf` | almost aligned | The left edges of two paragraphs differ by 1.5 px.<br>elements: paragraph 1 × paragraph 2<br>measured: deltaPx 1.5 | dd step 2 | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/crops/02-near-miss-b7c2d9e0.png` |
| `small-target:d4e5f6a7b8` | small target (probe: serious?) | The “Menu” button is 28 px, under the 39 px a finger needs.<br>elements: button “Menu”<br>measured: smallestSidePx 28 | pl step 2 | `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/crops/02-small-target-d4e5f6a7.png` |

## Criteria

Score each criterion on each of its screens with a whole number from 1 to 10, or `null` where the steps never touched it. Explain any score below 8 with a finding of that criterion on that screen.

Scale: 10 — could not be better; 8 — good, small things; 6 — gets in the way noticeably; 4 — done with difficulty; 2 — almost failed; 1 — failed.

| id | Criterion | What to judge | Screens |
|---|---|---|---|
| `findability` | Findability | What is needed is found without a hint: a button, a menu item, a place on the page. No guessing where it is. | dd, pl |
| `proximity` | Proximity | An action sits next to what it acts on, where the eye already is: no extra pages, scrolling or long pointer travel. | dd, pl |
| `feedback` | Feedback | Every action gets a visible answer at once: the press shows, waiting is shown, the result is clear. | dd, pl |
| `control` | Control | Nothing happens without asking; one can change one’s mind, undo, go back and not lose what was written. | dd, pl |
| `wording` | Clear wording | Labels, buttons and messages make sense to this person without explanation, in their words, not a developer’s. | dd, pl |
| `trust` | Trust | It is clear that what was done is saved and that the site behaves reliably; nothing alarms or raises doubt. | dd, pl |
| `consistency` | Consistency | The same thing looks and behaves the same on different screens; a habit learnt on one works on another. | dd, pl |
| `errors` | Errors and ways out | Mistakes are hard to make; when one happens, it says what is wrong and how to get out. Any place can be left. | dd, pl |
| `phone` | Phone | On a phone everything is within a finger’s reach and readable without zooming; nothing runs off the edge or hides under the keyboard. | pl |
| `tidiness` | Tidiness | Nothing overlaps, edges line up, gaps are even, text is not cut off; the screen looks put together. | dd, pl |

## Severity

| severity | When |
|---|---|
| `blocker` | The task cannot be finished, or what was done is lost. |
| `serious` | The task is done with difficulty or a mistake, or the screen has a gross defect: an overlap, cut-off text, something off the edge. |
| `minor` | It slows down, annoys or looks untidy, but does not stop the task. |
| `taste` | A personal preference; it may stay as it is. |

## Your answer

Write `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/reviews/R1/review.json`: one JSON object, as in the example (the example shows only some criteria and findings; yours has all of them):

```json
{
  "schema": 2,
  "job": "diary-today.novice",
  "review": "R1",
  "kind": "fresh",
  "attempts": {
    "dd": "1020-090000-dd",
    "pl": "1020-090500-pl"
  },
  "overall": "Two or three sentences: how it went, in this person’s words.",
  "scores": {
    "findability": {
      "dd": 9,
      "pl": 7
    },
    "proximity": {
      "dd": null,
      "pl": 8
    }
  },
  "why": {
    "findability": "Why the scores are what they are, in a sentence or two."
  },
  "probe": {
    "overlap:k3f9a2x7qd": {
      "verdict": "confirmed",
      "why": "In the close-up the label runs over the button."
    }
  },
  "findings": [
    {
      "id": "F1",
      "severity": "minor",
      "criterion": "tidiness",
      "attempt": "1020-090000-dd",
      "step": 2,
      "shot": "tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/02-new-entry.marked.png",
      "where": "Where on the screen: “the header, right of the title”.",
      "text": "What is wrong, as you saw it.",
      "expected": "What you expected.",
      "fix": "How it should be, in your view.",
      "probe": [
        "overlap:k3f9a2x7qd"
      ]
    }
  ],
  "previous": [],
  "liked": [
    "What you liked, briefly."
  ],
  "filesRead": [
    "tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/reviews/R1/brief.md"
  ]
}
```

- `schema` is 2; `job` is `diary-today.novice`; `review` is `R1`; `kind` is `fresh`.
- `attempts`: exactly `{"dd":"1020-090000-dd","pl":"1020-090500-pl"}`: the plays this brief gives you.
- `overall`: two or three sentences on how it went, in this person’s words.
- `scores`: for each criterion of the table, an object of screen → score with exactly its screens; `null` where the steps never touched it.
- `why`: per criterion, a sentence or two on why the scores are what they are.
- `probe`: for each fingerprint under “Needs a verdict”, its `verdict` and `why`.
- `findings`: what is wrong, one problem per finding: `id` (F1, F2…), `severity`, `criterion` (an id from the table), `attempt` (an attempt id), `step` (the step number), `shot` (the path of the screenshot that shows it), `where` (where on the screen), `text` (what is wrong), `expected` (what you expected), `fix` (how it should be, in your view), `probe` (fingerprints, if it is about them). One problem on several screens is one finding with the most telling screenshot; name the other screens in `where`.
- `previous`: an empty array — this is a fresh review.
- `liked`: what you liked, briefly; it may be empty.
- `filesRead`: every file you opened, by the path you opened it with.

## Files

Read only these:

- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/reviews/R1/brief.md`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/01-open-the-dashboard.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/01-open-the-dashboard.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/02-new-entry.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/02-new-entry.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/03-write-and-save.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/shots/03-write-and-save.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/01-open-the-dashboard.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/01-open-the-dashboard.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/02-find-it-in-the-menu.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/02-find-it-in-the-menu.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/03-write-and-save.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/shots/03-write-and-save.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/crops/02-overlap-k3f9a2x7.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090000-dd/crops/02-near-miss-b7c2d9e0.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/diary-today.novice/attempts/1020-090500-pl/crops/02-small-target-d4e5f6a7.png`
