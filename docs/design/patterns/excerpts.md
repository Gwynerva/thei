# Excerpts

An excerpt is a named part of a diary entry, an event or a project, about
something else in the archive: a title, a text and at least one relation,
with a summary, a banner and the owner's privacy at will (`AGENTS.md`,
"What Thei Is About"). This page gathers how one looks: read whole on its
parent's page, on a page of its own, as a torn card on the pages of what it
is about and on the chronologies, and edited in a modal of its parent's form.
It describes what the code does; it adds no rule of its own yet, and the rules
proposed for it wait for the owner's word.

## On its parent's page

- An excerpt is read in full after its parent's own text, each in an
  `article` of its own under a level-two heading that is a link to the
  excerpt's page (`rel="bookmark"`), with its summary, its banner and what it
  is about as chips before the text (`app/components/public/PublicExcerptInline.vue`,
  `app/components/public/PublicRelationChip.vue`). The headings of its text
  sit one level lower than on its own page (`headingShift` of
  `ContentRenderer`), and their anchors carry the excerpt's own first, so two
  excerpts with the same heading never share one (`excerptHeadingId` in
  `shared/content-headings.ts`).
- The sidebar lists the parent's excerpts under its contents
  (`app/components/public/PublicExcerptList.vue`, `PublicDetailPanel.vue`),
  and a link to one lands on it (`#excerpt-<id>`, the zone `excerpts`; see
  [Landing](landing.md)).
- A diary entry may be nothing but its excerpts: the day's text is left out,
  and the entry still opens.

## On its own page

- The page is the parent's hero with the excerpt's banner, title and summary,
  the parent named above the title as a section names its project, the
  chips of what it is about, the text, and the previous and next excerpt of
  the parent as neighbours (`app/components/public/PublicExcerptPage.vue`,
  the pages under `app/pages/diary/[date]/excerpts/`,
  `app/pages/events/[event]/excerpts/` and
  `app/pages/projects/[projectUuid]/excerpts/`).
- Its address lives under its parent's: `…/excerpts/<slug>-<id>/`
  (`shared/excerpt-url.ts`). It is as open as its parent unless it is private,
  and its private side is the parent's (`server/thei/excerpts/parents.ts`).

## On the pages of what it is about

- A target's page shows the excerpts about it in a block of their own after
  the sections and before the relations, newest first and a page at a time
  (`app/components/public/PublicExcerptsBlock.vue`,
  `server/thei/public/excerpts.ts`).
- Each is a card torn above and below — the outline of
  `tornStripOutlinePath` in `shared/continuation-outline.ts`, drawn by
  `PublicContentCard` with `torn` — with its parent named the way a card
  names what its subject belongs to, the kind of the relation and its note
  (`app/components/public/PublicExcerptAbout.vue`).
- On a project's chronology an excerpt about the project is a point of its
  own, dated by its parent's day, and the parent's own card is not there
  beside it; on the Life the parent's card names its excerpts instead
  (`app/components/life/LifePointCard.vue`, `server/thei/public/life.ts`).
  A project's chronology opens with the year at a glance
  (`app/components/life/LifeActivityHeatmap.vue`), as the Life does.

## In the admin

- A parent's form has a block «Отрывки» after its text and before its
  relations, built like a project's sections: rows that open a modal, dragged
  into the owner's order, and «Добавить» (`app/components/admin/excerpts/AdminExcerpts.vue`,
  `AdminExcerptRow.vue`). A row shows the title, the summary and chips of what
  the excerpt is about; one about nothing any more — its target deleted and
  the excerpt kept — says so.
- The modal follows a section's: title and privacy, the address under the
  parent's, «Про что» as the relations block with the excerpt as its owner
  and its parent excluded, the summary, the text, the banner and the AI's
  memory (`AdminExcerptModal.vue`, `excerpt-modals.ts`). What it still needs
  — a title, a text, what it is about — is said as a form's needs are.
- A target's own relations block shows the excerpts about it on a fourth
  tab, read only: a chip leads to the parent's form, opened on the excerpt
  (`?excerpt=<id>`), since only that form edits it
  (`app/components/admin/AdminRelations.vue`, `app/composables/excerpts-about.ts`).
  The block recommends a relation to an entity that has an excerpt about
  this one, first.
- Deleting a project, an event or an entry that excerpts are about asks what
  becomes of them, in the deletion pane: keep them (the default) or delete
  them too, with how many there are and for how many it is the only thing
  they are about (`AdminExcerptsOnDelete.vue`). Excerpts of the entity
  itself go with it.
- An excerpt is edited in its parent's form by the admin and by a model
  alike: an action on it waits at the field it changes in the modal, and its
  relations are proposed from its own side (see
  [AI in the UI](ai-in-the-ui.md)).

## How it is checked

- `tests/e2e/excerpts.spec.ts`: an entry that is only an excerpt, written in
  the modal and about a project; the deletion pane's two answers; the block
  and the modal on a phone.
- `tests/server/public-excerpts.test.ts`: who sees an excerpt where — the
  parent's access, its privacy, the viewer, a day still to come.
- `tests/server/life-excerpts.test.ts`: the chronology's points and the
  Life's cards.
- A look in the browser at 960 and 375 px, in both themes: the parent's page
  with the sidebar, the excerpt's page, a target's block, the form's block
  and the modal.
