# Review R2 · “Find and read a project” · Guest

Study “Today’s entry and search”: Can a newcomer write today’s entry, and can a guest find a project and read it? Job `find-and-read.guest`.

This is a recheck: the job was reviewed before (R1) and has been played again since. Judge the new plays below: score them anew, go through the checklist of earlier findings on the new screenshots, and add new findings.

## Rules

- You are the person under “Who you are”, not a developer. Judge only by what the screenshots show and this brief says.
- Project instructions (AGENTS.md, CLAUDE.md or any other, if they reached your context) are a developer’s knowledge. Do not use them: this person does not know them.
- Read only the files under “Files”. Open or search nothing else: no code, no other reviews, no other attempts.
- Write one file only: `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/reviews/R2/review.json`. Create or change nothing else.
- Answer in English.

## Who you are

**Guest.** You are a visitor: you have not signed in and see what a stranger sees.

You came by a link from a friend and see the site for the first time, on your phone, on the go. You do not know how it is built or what is in it. You leave if a page loads slowly or the text is small.

## The task

> Find the project that talks about “seedlings”, open its section and the third picture of its gallery.

Scenario “Find and read a project”; screens: pl — phone, light theme.

## The new plays

### Phone, light theme — attempt `1020-100000-pl`

Window 375×812, pixel density 2×. The play went to the end in 2 s. The site ran in development mode: do not judge response times; judge the number of actions, the pointer’s travel and whether waiting is shown.

| # | Step | Action | Pointer travel | Scroll | Waiting | Hindrances | Probe | Screenshot |
|---|---|---|---|---|---|---|---|---|
| 1 | Find “seedlings”<br>`/search/?q=seedlings` | type | — | — | first feedback 90 ms, answer 400 ms | — | — | `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/01-find-seedlings.marked.png` |
| 2 | Open the project<br>`/projects/greenhouse/` | tap “Open” | 136 px | — | first feedback 90 ms, answer 400 ms | — | — | `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/02-open-the-project.marked.png` |

A marked screenshot (`.marked.png`) shows the pointer’s way and numbered frames around the probe’s suspicions. The plain screenshot lies next to it, under the same name without `.marked`.

## Earlier findings: a checklist

Go through each earlier finding on the new plays above: open the new screenshot where it would show and say what you see there now. Mark each one in `previous`:

- `status`: `fixed`; `still` (as it was); `worse`; or `unclear` (the new screenshots do not tell);
- `attempt`, `step`, `shot`: the step and screenshot of the new plays you judged it on, never an old one;
- `why`: what that new screenshot shows, in a sentence or two;
- `severity` only if it changed; `probe` only for fingerprints of the new plays.

The old screenshot is there for reference only: what counts is what the new plays show. Do not repeat these as new findings.

- [ ] **R1/F1** · serious · Clear wording (`wording`): The project’s title is cut mid-word; one cannot tell what it is about.
  - Look now at: `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/01-find-seedlings.marked.png` (attempt `1020-100000-pl`, step 1, “Find “seedlings””).
  - Then: The first search result, its heading. Expected: The whole title, or one with an ellipsis. Old screenshot, for reference only: `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1019-180000-pl/shots/01-find-seedlings.marked.png` (attempt `1019-180000-pl`, step 1).

## The probe’s suspicions

The probe suspected nothing. In your answer, `probe` is an empty object `{}`.

## Criteria

Score each criterion on each of its screens with a whole number from 1 to 10, or `null` where the steps never touched it. Explain any score below 8 with a finding of that criterion on that screen.

Scale: 10 — could not be better; 8 — good, small things; 6 — gets in the way noticeably; 4 — done with difficulty; 2 — almost failed; 1 — failed.

| id | Criterion | What to judge | Screens |
|---|---|---|---|
| `findability` | Findability | What is needed is found without a hint: a button, a menu item, a place on the page. No guessing where it is. | pl |
| `proximity` | Proximity | An action sits next to what it acts on, where the eye already is: no extra pages, scrolling or long pointer travel. | pl |
| `feedback` | Feedback | Every action gets a visible answer at once: the press shows, waiting is shown, the result is clear. | pl |
| `control` | Control | Nothing happens without asking; one can change one’s mind, undo, go back and not lose what was written. | pl |
| `wording` | Clear wording | Labels, buttons and messages make sense to this person without explanation, in their words, not a developer’s. | pl |
| `trust` | Trust | It is clear that what was done is saved and that the site behaves reliably; nothing alarms or raises doubt. | pl |
| `consistency` | Consistency | The same thing looks and behaves the same on different screens; a habit learnt on one works on another. | pl |
| `errors` | Errors and ways out | Mistakes are hard to make; when one happens, it says what is wrong and how to get out. Any place can be left. | pl |
| `phone` | Phone | On a phone everything is within a finger’s reach and readable without zooming; nothing runs off the edge or hides under the keyboard. | pl |
| `tidiness` | Tidiness | Nothing overlaps, edges line up, gaps are even, text is not cut off; the screen looks put together. | pl |

## Severity

| severity | When |
|---|---|
| `blocker` | The task cannot be finished, or what was done is lost. |
| `serious` | The task is done with difficulty or a mistake, or the screen has a gross defect: an overlap, cut-off text, something off the edge. |
| `minor` | It slows down, annoys or looks untidy, but does not stop the task. |
| `taste` | A personal preference; it may stay as it is. |

## Your answer

Write `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/reviews/R2/review.json`: one JSON object, as in the example (the example shows only some criteria and findings; yours has all of them):

```json
{
  "schema": 2,
  "job": "find-and-read.guest",
  "review": "R2",
  "kind": "recheck",
  "attempts": {
    "pl": "1020-100000-pl"
  },
  "overall": "Two or three sentences: how it went, in this person’s words.",
  "scores": {
    "findability": {
      "pl": 9
    },
    "proximity": {
      "pl": null
    }
  },
  "why": {
    "findability": "Why the scores are what they are, in a sentence or two."
  },
  "probe": {},
  "findings": [
    {
      "id": "F1",
      "severity": "minor",
      "criterion": "tidiness",
      "attempt": "1020-100000-pl",
      "step": 2,
      "shot": "tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/02-open-the-project.marked.png",
      "where": "Where on the screen: “the header, right of the title”.",
      "text": "What is wrong, as you saw it.",
      "expected": "What you expected.",
      "fix": "How it should be, in your view."
    }
  ],
  "previous": [
    {
      "id": "R1/F1",
      "status": "fixed",
      "attempt": "1020-100000-pl",
      "step": 1,
      "shot": "tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/01-find-seedlings.marked.png",
      "why": "In the new screenshot the label sits above the button with a clear gap."
    }
  ],
  "liked": [
    "What you liked, briefly."
  ],
  "filesRead": [
    "tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/reviews/R2/brief.md"
  ]
}
```

- `schema` is 2; `job` is `find-and-read.guest`; `review` is `R2`; `kind` is `recheck`.
- `attempts`: exactly `{"pl":"1020-100000-pl"}`: the plays this brief gives you.
- `overall`: two or three sentences on how it went, in this person’s words.
- `scores`: for each criterion of the table, an object of screen → score with exactly its screens; `null` where the steps never touched it.
- `why`: per criterion, a sentence or two on why the scores are what they are.
- `probe`: for each fingerprint under “Needs a verdict”, its `verdict` and `why`.
- `findings`: what is wrong, one problem per finding: `id` (F1, F2…), `severity`, `criterion` (an id from the table), `attempt` (an attempt id), `step` (the step number), `shot` (the path of the screenshot that shows it), `where` (where on the screen), `text` (what is wrong), `expected` (what you expected), `fix` (how it should be, in your view), `probe` (fingerprints, if it is about them). One problem on several screens is one finding with the most telling screenshot; name the other screens in `where`.
- `previous`: one item per earlier finding of the checklist, with these keys and no others: `id`, `status`, `attempt`, `step`, `shot` (of the new plays) and `why` (what that screenshot shows), plus `severity` only if it changed and `probe` only for fingerprints of the new plays.
- `liked`: what you liked, briefly; it may be empty.
- `filesRead`: every file you opened, by the path you opened it with.

## Files

Read only these:

- `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/reviews/R2/brief.md`
- `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/01-find-seedlings.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/01-find-seedlings.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/02-open-the-project.marked.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1020-100000-pl/shots/02-open-the-project.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1019-180000-pl/shots/01-find-seedlings.png`
- `tests/lab/review/fixtures/runs/fixture/jobs/find-and-read.guest/attempts/1019-180000-pl/shots/01-find-seedlings.marked.png`
