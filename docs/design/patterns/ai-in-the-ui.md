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
- The switch (`app/components/ai/AiSwitch.vue`) stands first on the AI
  page's connection tab, and first in the site's settings too: with AI off
  and its ✦ gone, settings are where it is looked for, and at their end it
  took a long scroll to find. Its words never say anything is deleted —
  off, AI hides, and what it kept comes back on, and they say where it is
  turned on again.

## Where the ✦ goes

| Place           | Component                                  | What it holds                                                                |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| A form's header | `app/components/ai/AiEntityButton.vue`     | A badge counting the proposals in the form; a menu to ask about the entity.  |
| The admin bar   | `app/components/admin/bar/AdminBarAi.vue`  | How much waits; the sessions that wait; a new one about the page's entity.   |
| A field's label | `app/components/ai/AiFieldOffer.vue`       | Quiet, asks about the field; the proposals for it; a file's description too. |
| A list's title  | `app/components/SectionHeader.vue` (`ai`)  | Asks about the list — tags, relations — whose proposals are its chips.       |
| A text's editor | `app/components/ai/AiTextAsk.vue`          | Left of its history: asks about the text in hand; what waits for it counted. |
| The dashboard   | `app/components/admin/AdminAiSessions.vue` | The sessions, under the `sparkles` icon of their box.                        |

The AI page itself is named by `sparkles` wherever it is linked. Nowhere else:
never a banner, never a block under a field, never a badge that asks for
attention.

## Proposals

- With AI on, every field a proposal can change has its ✦, quiet until it
  has something: a click asks the model about that field alone — a few ready
  requests, or the owner's words — and a session answers in the background
  while the ✦ runs, with a stop in its box. Not at a switch, whose ✦ only
  brings what was proposed. The owner's words carry a header naming the field.
  The ✦ names the field as its label does («Суть события», never a generic
  «Суть»), and so does the session it starts.
- Its ready requests are the field's kind's; those that only mend what is
  there — check the dates, make it shorter, check a text for mistakes — only
  once the field holds something (`ai_field_ask_quick_filled`): a tap that
  can only answer «nothing» is not offered.
- Answered with nothing to propose, the ✦'s box goes — on a phone it is a
  sheet over the fields the owner goes on to — and the answer stays beside
  the ✦: the `ai-chat` mark — never a `check`, which reads as done when the
  model could not propose — and its own last words, why nothing, on one line
  clipped with a hint. A tap on it opens the box again, with all of the words
  and a link to the session. A list's proposals among its chips count as an
  answer.
- A proposal for a field waits at its label: the label turns to the accent and
  a ✦ beside it opens the proposal on hover, a tap or the keyboard. Several are
  paged one at a time, the pager at the start of the card's footer (see
  [Fields](../components/fields.md)).
- Proposed tags and relations stand among the form's own as dashed chips
  (`app/components/ai/AiOfferChips.vue`), each opening its proposal.
- A proposal is drawn as its session's card draws it, and every card has one
  shape, wherever it stands — a session, a field's label, a bundle
  (`app/components/ai/AiActionRow.vue`):
  - the head, on `bg-bg-3`: what changes, in bold and without icons — the
    field, the text, the kind of change — and what it is of in plain words
    beside it (`AiActionWhat.vue`); one left to the owner's call ends it
    with a `warning` icon, «На ваше решение» in its hint;
  - the change, old → new (`AiActionChange.vue`, `AiActionValue.vue`): word
    by word where most of the shorter value stays, so an addition reads as
    one; whole, struck → new, where it is written anew; a list item by item,
    what stays plain beside what goes and what comes, so a synonym taken
    away is never read as a word corrected; a value emptied, said so. Every
    kind says its change so: dates, tags, a relation's ends, access, a text
    written whole, a text edit's first parts, a new entity's fields, what is
    deleted, what is remembered, a word of the dictionary, a memory in fewer
    facts, a file's description beside the file;
  - the model's reason, and where it came from;
  - the footer, on `bg-bg-3`: «Исправить самому» and comment (or open, for
    a text edit) as squares at its start, after a pager where there is one;
    decline as a square ✕ and the accept button at its end — then
    «Отменить» or «Вернуть» in their place. Its neutral buttons are `raised`, so they
    show on that ground.
  - In a popup — at a field's label, on a proposed chip — the card draws no
    ground of its own, as [Popups](../components/popups.md) asks: head,
    change and footer are parted by horizontal rules on the popup's one
    ground, so the popup and its arrow stay one surface, and the footer's
    neutral buttons are `secondary` (`AiActionRow`'s `inPopup`).
- A bundle is headed and decided alike: its head on `bg-bg-3` says what the
  rows are and how many are sure, each row starts with its checkbox and its
  first line, its own tools at the end of that line, and the footer says its
  hint first, then ✕ and «Применить · N». A comment written in the card
  opens over its footer, never under it.
- Once decided, a card's undo or way back stands where the pressed button
  stood: for half a second it takes no press, so a double click never
  applies and undoes at once. Correcting the words, the way back to the
  model's is `undo`, never the decline's ✕.
- The accept button says what it does. Where it changes the archive at
  once — a session, what the AI remembers, a text edit's own screen — it is
  «Применить». In a form nothing changes before the form is saved, so it
  says what it does to the form: «Подставить» a value — a field, the dates,
  the access, several fields, a file's description — and «Добавить» or
  «Убрать» a tag or a relation (`ai_offer_put`); on the review screen of a
  text's editor, whose text is saved with the editor, «Подставить · N». Its
  hint says the rest, and once taken the toast says the form changed.
  «Отменить» and «Вернуть» carry their words too. Everything else is a
  neutral square with its hint. Only accept is in the accent; a change that
  cannot be undone — a deletion — is accepted with a button in the error
  colours.
- Declined in a form — at a field's label, among the chips, at the form's
  head — a proposal stays where it stood in its declined state, «Вернуть»
  and «Больше не предлагать» beside it, as a session's card does: never a
  toast at the top of the window, far from the field. It goes once its
  popup is put away or the form is saved.
- Taken at the form's head, a row stays where it stood too, saying it is in
  the form and changes once saved, with «Отменить» to take it back, until
  the form is saved: a row gone at once moved the form under the owner's
  finger, and the next tap landed on the access switch. Taken at a label
  or among chips, the toast says the form changed.
- What the form cannot take opens in its session (the `ai-chat` icon); a text
  edit opens on the review screen of the text's own editor. Once its parts
  are taken, the text opens on the first block they changed, not at its top.
- A text's editor asks about the text from its own ✦, left of its history:
  check it for mistakes, mend its links, put it in order, or words of the
  owner's, answered in the background as at a field. An edit of the text it
  proposes opens on the editor's comparison as soon as it comes — the owner
  asked here, so it is what they wait for — and the others wait in the notice
  over the text; an answer with nothing to change says so in the ✦'s box,
  with the model's words. Its badge counts the edits that wait for the text.
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
- While several proposals wait in a session, a slim line above its composer
  (`app/components/ai/AiSessionWaiting.vue`) says how many and goes to the
  next one down the thread at a click, and applies the sure ones together —
  never a final one, nor a text decided part by part — with an undo in its
  toast, which takes them back the last first, tells the open forms, and
  says why one changed since could not be. Nothing is declined from there. The sure ones are offered once the
  session has stopped answering, and their button takes no press in its
  first moments, so «Проверить ещё» pressed twice never applies what nobody
  has seen. On a phone the button goes under the count rather than cut it.
- A check with more to look at goes on from that same line, where the owner
  is however far up its answer: «Просмотрено: M файлов» — in this session,
  never another run's — and a button «Проверить ещё N файлов», as many as
  are due of what its model last asked for — files, entries, links or texts,
  what the check looks at, never a bare number — that runs the next batch
  in the same session — after a turn paused at its limits too — once no
  sure ones wait.
  It stands beside the count, never where «Применить уверенные» stands, so
  one never turns into the other under the pointer. The thread follows the next
  batch down as it comes. With nothing left, the answer says that all of it
  was looked at. Nothing runs by itself.
- A new session sent from the AI page says «Начинаю сессию…» over the
  composer until it opens: the words have left the field at once.
- In a session the thread itself shows a comment and an answer as they are
  sent, and the model's reply as it comes: no toast says it again.
- A check run over the whole archive with nothing new starts nothing and says
  so in a toast, with how much it has looked at («нового нет — всё
  просмотрено (144 файла)») and one way on: «Прошлая проверка» while its
  proposals wait there, else «Проверить заново», which forgets what it looked
  at and goes through all of it again, a batch at a time. Run on entities, it
  starts over by itself once all of them is looked at.
- The owner's message begun from a template carries a header naming it, as a
  comment names the action it is about.
- A session's head names what it is about as chips, eight at first: a check
  over the whole archive is about a hundred, and «ещё N» opens the rest.

## Templates and models

- To the owner, templates are «Готовые просьбы»: the built-in ones are
  checks («Встроенные проверки»), the owner's own are requests («Ваши
  просьбы»). A session starts from one chosen in a select, beside the select
  of the model that answers it (`app/components/ai/AiPresetPicker.vue`,
  `app/components/ai/AiModelPicker.vue`) — never a row of chips. The model is
  a session's, named by itself, and changes from the session's head, where
  what it spent is the hint of its mark, not words in the head; a ready
  request names none.
- Ready requests are a table in sections, built-in and the owner's own; a
  row opens its request in a new session, a check's row also runs it over
  what is new, and a built-in one's window copies it from an icon in its
  header.

## Stopping

- While the model answers, `app/components/ai/AiStopButton.vue` stops it:
  `pause-circle`, an icon alone in the accent. It stands beside the
  composer's send button whatever is typed — words sent meanwhile the model
  takes in — and beside a session answering in a form's ✦ menu.
- Stopped, a turn ends at once, and for sure: what was written stays, with a
  notice saying why it stopped — by the owner, out of time, or cut off by a
  restart. A pause — stopped by the owner, a turn's steps or time run out —
  is drawn quiet, in the neutral colours, and says how to go on; only a
  failure is drawn in the warning colours.

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

- The owner chose the words on 2026-10-18: a newcomer read «Применить» in
  a form as «saved at once», every time, so the accept says what it does
  where it stands, «Шаблоны» became «Готовые просьбы», «Связанные
  сущности» became «Связи», and no copy speaks of «сущности». «Сессии»
  stay: a session of the AI and a sign-in session are told apart by where
  they stand.
- The owner wants AI to stay a guest: a site that works the same without it,
  and that, with it, shows proposals where they belong rather than in a feed.
- Blocks under fields, a pager on a row of its own and three button styles in
  one card were each tried and turned down.
- A card whose head, body and buttons each kept an inset of their own read
  as "a mess" to the owner, who set the one shape above (2026-10-17): what
  changes, old → new, why, and the same footer everywhere.
- A check gone on with «Проверить ещё 4 файла» brought its batch out of
  view, and «Применить уверенные · 4» took the pressed button's place: a
  second press applied what nobody had seen.
- A phone's sheet that stayed open after «nothing to propose» covered the
  next ✦ and the Save again and again in one journey, and «check the dates»
  on a section with none cost a wait for a sure «nothing».
  The box now goes with such an answer, which stays at the ✦ instead, and
  only requests that can find something are offered — an empty field says
  so in its box (`ai_field_ask_empty`), the owner's own words still welcome.

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
