# AI in the UI

AI in Thei is optional and off until the owner turns it on. When it is on, it
shows itself with one mark — the ✦, the `sparkles` icon, in the accent — in a
few fixed places, and what it proposes waits where the thing it would change
is. When it is off, no trace of it is drawn and nothing is asked about it.

What AI does is set out in the AI section of `AGENTS.md`; this page is only
about how it looks.

## AI off

- Nothing shown only because of AI renders anything while it is off: the ✦ of
  a form, the ✦ of the admin bar, a memory block, a proposal at a label, the
  dashboard's AI box, the counts of what waits.
- Nothing asks about it either: no request goes out from a page about AI while
  it is off.
- The admin learns whether it is on from `aiEnabled` in the admin bar's
  summary, through `useAiEnabled()` (`app/composables/ai-enabled.ts`). An
  entity's form asks `useEntityAi()` and its `shown`, which is false with AI
  off.
- No page, form, list or public route may need AI. The tabs of the AI page
  that need it point to the switch that turns it on.

## Where the ✦ goes

| Place           | Component                                  | What it holds                                                               |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| A form's header | `app/components/ai/AiEntityButton.vue`     | A badge counting the proposals in the form; a menu to ask about the entity. |
| The admin bar   | `app/components/admin/bar/AdminBarAi.vue`  | How much waits for the owner; the sessions that wait; a new session.        |
| A field's label | `app/components/ai/AiFieldOffer.vue`       | The proposals for that field, a file's description in its window too.       |
| The dashboard   | `app/components/admin/AdminAiSessions.vue` | The sessions, under the `sparkles` icon of their box.                       |

The AI page itself is named by `sparkles` wherever it is linked. Nowhere else:
never a banner, never a block under a field, never a badge that asks for
attention.

## Proposals

- A proposal for a field waits at its label: the label turns to the accent and
  a ✦ beside it opens the proposal on hover, a tap or the keyboard. Several are
  paged one at a time, the pager at the left of the card's own buttons (see
  [Fields](../components/fields.md)).
- Proposed tags and relations stand among the form's own as dashed chips
  (`app/components/ai/AiOfferChips.vue`), each opening its proposal.
- A proposal is drawn as its session's card draws it
  (`app/components/ai/AiActionRow.vue`): what, why, where it came from, and
  its buttons.
- The card's buttons are square and of one rank: correct, comment and decline
  are the same neutral square; only accept is in the accent. A change that cannot be
  undone — a deletion — is accepted with a button in the error colours.
- What the form cannot take opens in its session (the `ai-chat` icon); a text
  edit opens on the review screen of the text's own editor.
- An accepted proposal is laid into the form and counts as applied once the
  form is saved — with the owner's words, when they corrected it in the form
  before saving.
- Where a proposal is applied as it stands — its session, a memory kind at a
  label — its words can be corrected first: the square `edit` button, or a
  click on the words themselves, turns them into fields in the row; the
  accept button then applies the corrected words, and Esc puts the model's
  back (`shared/ai-action-texts.ts` says which words of each kind). Once
  corrected it says «с вашей правкой», the model's own words in its hint.
- A described file is shown as its tile (`ContentFileTile`), which opens the
  library's window of the file — but in that very window.
- A check with more to look at ends its answer with one quiet button —
  «Дальше», or «Ещё N» when less than a batch is left — that goes on in the
  same session. Nothing runs by itself.
- The owner's message begun from a template carries a header naming it, as a
  comment names the action it is about.

## Templates and models

- A session starts from a template chosen in a select, beside the select of
  the model that answers it (`app/components/ai/AiPresetPicker.vue`,
  `app/components/ai/AiModelPicker.vue`) — never a row of chips. The model is
  a session's, named by itself, and changes from the session's head; a
  template names none.
- Templates are a table in sections, built-in and the owner's own; a row
  opens its template in a new session, a check's row also runs it over what
  is new, and a built-in one's window copies it from an icon in its header.

## Stopping

- While the model answers, `app/components/ai/AiStopButton.vue` stops it:
  `pause-circle`, an icon alone in the accent. It stands beside the
  composer's send button whatever is typed — words sent meanwhile the model
  takes in — and beside a session answering in a form's ✦ menu.
- Stopped, a turn ends at once, and for sure: what was written stays, with a
  notice saying why it stopped — by the owner, out of time, or cut off by a
  restart.

## Marks and words

- Things AI makes carry the sparkle in their own icon, as the speech bubble of
  `ai-chat`, a session, does; their buttons prefer that icon to a word.
- The undo of an applied action wears `history`, the icon of the past (see
  [Icons](../components/icons.md)).
- The two ways AI and the site connect are titled as arrows: "✦ AI → the
  site" and "the site → ✦ AI", the site by its own favicon and name
  (`app/components/ai/AiConnectionPanel.vue`).
- One meaning per word in what the owner reads: an **access key** is what Thei
  gives an app, an **API key** what a model's service gives Thei, and
  **tokens** only what a model spends.
- Text in a session is small (`text-sm`); the list of sessions is one line per
  session (see [Admin pages](admin-pages.md)).

## Why

- The owner wants AI to stay a guest: a site that works the same without it,
  and that, with it, shows proposals where they belong rather than in a feed.
- Blocks under fields, a pager on a row of its own and three button styles in
  one card were each tried and turned down.

## How it is checked

- `tests/e2e/ai-off.spec.ts` turns AI off and checks that no admin page asks
  about it, that what would change answers as if it were not there, and that
  turning it on offers it at once.
- `tests/server/ai-actions-contract.test.ts` fails when an action or a field
  misses a part: its reference, its card, its place in a form.
- `tests/e2e/ai-entity.spec.ts` opens proposals at labels and in the ✦ menu and
  checks each with `expectPopupUsable`, and stops a session from the ✦;
  `tests/e2e/ai-sessions.spec.ts` stops an answer with words typed.
- `tests/server/ai-stop.test.ts` stops turns stuck in a tool, in a silent
  service and past their clock, and checks what they leave.
