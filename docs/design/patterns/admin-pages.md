# Admin pages

The admin is where the owner writes a life down, so it should cost as little
attention as a diary does. This page gathers how its pages are put together:
headers that say little and show a lot, the dashboard's boxes, lists with a
search row, what an empty list says, and the two habits the owner asked for
most — suggesting quietly in place, and reading intent from what is done
rather than from a switch.

## Headers

- A form's header is a sticky glass row (`StickyGlassHeader`): the icon and
  the title, then the controls, then the main action. The forms of the
  entities, the settings and "about me" use
  `app/components/admin/AdminSaveHeader.vue`, whose button says "Create" for
  something not made yet, "Save" while there are changes and "Saved" when
  there are none.
- Save stays at the top, at the end of the header, on every screen: on a
  phone it is a square with a floppy disk (`app/components/admin/AdminSaveButton.vue`),
  so the title and the header's squares keep to one row.
- Under the header, a line says why a save failed or cannot be made
  (`app/components/HeaderErrorLine.vue`, a modal's too): it fades in, wraps
  as long as its words need with its cross at the end, and comes back for a
  new press once closed. What a form still needs is said there after a press
  of its Save or Ctrl+S (see [Buttons](../components/buttons.md)), shortly
  enough to stay a line or two on a phone.
- Every button of a header is one size: the ✦, delete and any other icon
  are `Button`'s `size="icon"` squares, and Save is as tall, a square too on
  a phone. A header's delete is never a padded text-size button. Under a finger
  they grow together, to `size-11`.
- Status is an icon with a hint; words only for what is urgent. Counts say
  what there is, without noise.
- One control per meaning.
- A decision waiting to be made replaces the header, and its consequences show
  in the content, not in a popup over it.
- Headers follow the same rules as a modal's (see [Modals](../components/modals.md))
  and are designed for 375 px — and 320 px — first.

## Forms

- A form goes from what is needed to what is not: the name and the words
  first, the rest in sections below.
- Synonyms, the least needed setting there is, come last, in a box of their
  own after every section — notes included — on every form that has them.

## The dashboard

`app/pages/admin/index.vue` is a grid of boxes, `gap-md`, two columns from
`sm:`. A box is `app/components/Box.vue`.

- A box of a list is headed by `app/components/admin/AdminOverviewHeader.vue`,
  the same on every one: the icon and title leading to the whole list, how
  many there are (a compact number, the exact one on hover), and a round
  accent "+" that starts a new one.
- Projects and events show their latest items under it
  (`app/components/admin/AdminEntityOverview.vue`); the other lists are links
  with a count (`app/components/admin/AdminDashboardLink.vue`).
- The AI box spans both columns, comes with the page and appears only when
  there are sessions to show (`app/components/admin/AdminAiSessions.vue`).
- A box with nothing in it says so in one faded line.

## Lists and search

- A list's toolbar is one wrapping row: the search field, growing, and the
  selects beside it (`app/components/admin/AdminEntityListToolbar.vue`).
- Filters are selects in that row, never a row of tabs or native selects:
  `FieldSelect` with `filter`, `compact` and `collapsible`, icons on the
  options, counts from the listing (see [Select](../components/select.md)). The
  first option narrows nothing; an option that would empty the list is faded.
  On a phone they shrink to their icons.
  `app/components/AssetLibrarySearch.vue` is the model.
- A list grouped by state shows its groups as headings, not as a switch: the
  AI sessions list ends with its archive as the last group, its titles faded.
- A table of things of more than one kind is one table in sections: a `th`
  head, then each kind under a `tr-section` row with its name and a line of
  what it means, as the sign-in sessions
  (`app/components/admin/AdminSessions.vue`) and the AI templates
  (`app/components/ai/AiTemplatesPanel.vue`) are. On a phone the side
  columns hide and what matters of them moves under the row's name.
- A row of such a list is one line: the title alone, in the regular weight,
  the chosen row told by its background and the accent — never bold — and the
  whole title in a hint only when it is cut (`data-title-popup-clipped`).

## Empty states

- An empty list invites the first one: `app/components/EmptyState.vue` with the
  list's own icon in an accent halo, a title, a line of description and the
  button that creates it (`app/components/admin/AdminEmptyList.vue`).
- A search that finds nothing shows `face-dead`, says that nothing matched and
  offers to clear the search. The public site's `PublicEmptyState` uses the
  same face; its `icon` says what else is missing — `tune`, the icon of the
  filters themselves, where the search has nothing to narrow its results by.

## Suggest in place

- What the site or an AI suggests waits next to the thing it is about: the
  recommended tags under the tag field, candidates on a tag's page, a proposal
  at a field's label.
- No header badges, banners or buttons that nag about missing data. Ask the
  owner before adding anything to a form's header or to the admin's global
  chrome.

## Implicit, not modes

- When a control can tell what the owner means from what they do, it gets no
  switch for it. The period picker has no "Day | Period" toggle: picking the
  same date twice is a day.
- Before adding a segmented control or a mode toggle to a form or a popup,
  check whether the interaction already tells the cases apart. Propose the
  toggle only when it truly cannot.
- A state that would be a mode is shown as a group or a place instead, as the
  archive of AI sessions is.

## Why

- The owner removed a sticky-header button counting suggested tags ("too
  intrusive"), a header of status sentences, a six-tab filter row that
  overflowed a phone, and a period picker's mode switch; each rule above is one
  of those decisions.
- Entities form a ladder of complexity (see `AGENTS.md`): a diary entry must
  stay cheap to create, and an interface that asks for attention makes it
  dear.

## How it is checked

- `tests/e2e/ai-sessions.spec.ts` checks the sessions list and its popups.
- New admin screens are looked at in the browser at 375 px and on a desktop, in
  both themes, before they are called done.
