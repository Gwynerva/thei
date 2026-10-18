# Review of a text

The screen a change to a text is gone through on, part by part, before any of
it is made: an AI's edit of the text — corrections, links, a new order — or
another version of it, a draft or a version from the history, against the
text as it is. One model drives it (`shared/content-review.ts`); the screen
is `app/modals/content-editor/review/ContentReview.vue`. It stands in the
editor's place, or opens on its own from a session.

## When to use it

For any change of a text that the owner takes or leaves in pieces. A change
of a field that is not a text is a proposal at the field's label instead
(see [AI in the UI](../patterns/ai-in-the-ui.md)).

## Rules

- The text is read as it will be, or as what goes and what comes, or as a
  list of the parts; the owner's choice of view is kept in the browser.
  Until they choose, it opens on what goes and what comes, so a correction
  is seen with the words it replaces. Each part opens a card where it
  stands, with the part before and after it.
- A part is accepted, left as it is, or undecided. A part left as it is stays
  where it was, marked in grey — a block in its place, a block it would have
  brought folded to a line — so it can be opened and decided again. The way
  through the parts never lands on one with nothing to open.
- Parts that stand on one another are decided together: a heading of a new
  order taken takes the order's moves, and the moves left as they were leave
  every part that stands on them.
- A change is shown by what it changes. Words rewritten are struck and
  marked, in a block drawn as its kind is drawn on the page — a heading, a
  quote, a list item by item. What changes besides the words is named in a
  line: a heading's level, a list's style or ticks, the formatting of words,
  a spoiler, a caption, where a link leads. A block of files shows its files
  as squares, those that come with a plus, those that go struck. A new order
  says how many blocks it moves, a split how many paragraphs it makes.
- In what goes and what comes, a block shown twice says which state is
  which, in the error and success colours, a picture included.
- Spoilers are drawn open: a change under one must be seen.
- What the owner typed, quoted in a card, a list or a folded line, passes
  through `publicText()`; the words of a correction do not, so a fix of a
  dash or a quote mark stays visible.
- The foot is slim and sticky: the part before, how many are decided of how
  many, the part after; then the finish, which always says what it does
  next. Nothing taken yet and some part could be taken as sure, it takes the
  sure ones («Accept the sure ones · N»); nothing to take that way, it
  closes; something taken, it applies — asking first while parts still wait
  — and «take the sure ones» stands beside it with its count while some are
  left.
- Closing is one step, whatever closes it — the close button, Escape, Back,
  a click around the card: the review goes, and the owner's word on what was
  decided goes with it to where it is kept. A click around the card with a
  card of a part open only closes that card.

## How it is built

- `shared/content-review.ts` makes the parts and the rows of each view:
  `proofreadReview`, `versionReview`, `orderReview`. `implied` says what a
  decision decides of the others. `shared/content-block-changes.ts` names
  what changed in a block besides its words, and compares its files.
- `ReviewDocument.vue` draws the rows with `ContentRenderer`, and
  `ReviewWords.vue` a block's words compared; `ReviewList.vue` is the list;
  `ReviewPartCard.vue` the card of a part; `ReviewFiles.vue` a block's files.
- `ModalContainer`'s `dismiss` is what a click around the card does; the
  review passes its own close. A popup closed by a press marks the press
  (`noteClosingPress` in `app/composables/modal.ts`), so the same click
  closes nothing more.

## Why

- The owner found the screen unsteady: a part left as it was could not be
  found again, a picture or a list changed showed nothing, and the foot did
  not say what it would do. Every part is now in reach and every change is
  drawn.
- In the AI lab a newcomer read only the corrected words — a letter changed
  is no change to the eye — and took the coloured «Close» for the way to
  accept, beside a bare «✓✓ 1». The review now opens on what goes and what
  comes, and its finish names the next step.

## How it is checked

- `tests/shared/content-review.test.ts` covers the parts, the rows of every
  view, what is left in reach, what a change names, and the parts that stand
  on one another.
- `tests/e2e/ai-review.spec.ts` and `tests/e2e/content-history.spec.ts` go
  through edits and versions in the browser, on a desktop and a phone.
