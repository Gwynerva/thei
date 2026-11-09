# Excerpts

An excerpt is a named part of a diary entry, an event or a project, about
one other thing in the archive: a title, a text and one relation — its
subject — with a summary, a banner and the owner's privacy at will (`AGENTS.md`,
"What Thei Is About"). This page gathers how one looks: read whole on its
parent's page, on a page of its own, as a torn card on the pages of what it
is about and on the chronologies, and edited in a modal of its parent's form.
It describes what the code does; it adds no rule of its own yet, and the rules
proposed for it wait for the owner's word.

## On its parent's page

- An excerpt is read in full after its parent's own text, each in an
  `article` of its own under a level-two heading that is a link to the
  excerpt's page (`rel="bookmark"`). Over the heading stands what it is
  about — the token of the entity and its name, leading to it, the
  relation's word when it has a direction and as much of its note as the
  line holds, the whole in the hint (`PublicRelationInline.vue`), and the
  curved arrow (`subfolder-arrow`) turned to run from the left and down to
  the heading — then come its banner and its text; its summary is left to
  its own page, since the text is read whole here
  (`app/components/public/PublicPageExcerpts.vue`,
  `app/components/public/PublicExcerptInline.vue`,
  `app/components/public/PublicPageParent.vue` with `arrow`,
  `app/composables/excerpt-subject.ts`). The headings of its text
  sit one level lower than on its own page (`headingShift` of
  `ContentRenderer`), and their anchors carry the excerpt's own first, so two
  excerpts with the same heading never share one (`excerptHeadingId` in
  `shared/content-headings.ts`).
- The sidebar lists the parent's excerpts under its contents, and only there:
  the contents name none of them
  (`app/components/public/PublicExcerptList.vue`, `PublicDetailPanel.vue`),
  and a link to one lands on it (`#excerpt-<id>`; see
  [Landing](landing.md)).
- An excerpt the reader may not read — private, or about something closed
  to them — keeps its place on its parent's side as its codename with a
  lock, the one its point on a chronology goes by: in the text
  (`app/components/public/PublicExcerptSecretInline.vue`), in the sidebar
  and in the list of the parent's card on the Life. It is no heading and no
  link, and nothing of it is said. The page of what it is about and the
  search leave it out (`secretParentExcerpts` in
  `server/thei/public/excerpts.ts`, `shared/excerpt-secrets.ts`).
- A diary entry may be nothing but its excerpts: the day's text is left out,
  and the entry still opens.

## On its own page

- The page is the parent's hero with the excerpt's banner, title and summary,
  over the title «Excerpt 2 of 3 in» its parent — «Excerpt in» it when it is
  the only one — and under that «About» what it is about, with the arrow
  turning down to the title, as on the parent's page; then the text, and the previous and next excerpt of
  the parent as neighbours (`app/components/public/PublicExcerptPage.vue`,
  the pages under `app/pages/diary/[date]/excerpts/`,
  `app/pages/events/[event]/excerpts/` and
  `app/pages/projects/[projectUuid]/excerpts/`).
- Its address lives under its parent's: `…/excerpts/<slug>-<id>/`
  (`shared/excerpt-url.ts`). It is as open as the stricter of its parent and
  its subject unless it is private, and is seen only by whoever may open
  both (`server/thei/excerpts/parents.ts`): one about something private is
  not on its public parent's page, its lead, the search or the sitemap; one
  about something open by its link only opens by its own address and on the
  subject's page, and is listed nowhere else.
- An excerpt about nothing — its subject deleted — has no line of what it is
  about, and is as open as its parent.

## On the pages of what it is about

- A target's page shows the excerpts about it in a block of their own after
  the sections and before the relations, newest first and a page at a time
  (`app/components/public/PublicExcerptsBlock.vue`,
  `server/thei/public/excerpts.ts`).
- Each is a card torn above and below — the outline of
  `tornStripOutlinePath` in `shared/continuation-outline.ts`, drawn by
  `PublicContentCard` with `torn` — with its parent named the way a card
  names what its subject belongs to and, in that same line, the relation's
  word when it has a direction and as much of its note as the line holds,
  the whole in the hint (`app/components/public/PublicParentLink.vue`,
  `PublicRelationInline.vue`).
- The relation an excerpt stands on is its own, not its parent's: the
  relations block of neither end lists it. Only a relation the owner made
  between the two directly is listed there (`resolvePublicRelated` in
  `server/thei/public/related.ts`).
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
  `AdminExcerptRow.vue`, the list kept by `app/composables/modal-parts.ts`
  as a project's sections are). A row shows, over its title, what the
  excerpt is about the way its public page says it — the token of the
  entity and its name, the relation's word when it has a direction and as
  much of its note as the line holds (`PublicRelationInline.vue`), and the
  arrow turning down to the title — then the title and the summary, over
  its banner or the first picture of its text; one about nothing any more
  — its subject deleted and the excerpt kept — says so in the warning tone
  in that line. Its lock is there when it is private or its subject is,
  the hint saying which.
- The modal follows a section's: title and privacy, the address under the
  parent's, «Про что», the summary, the text, the banner and the AI's memory
  (`AdminExcerptModal.vue`, `excerpt-modals.ts`). What it still needs — a
  title, a text, what it is about — is said as a form's needs are.
- «Про что» is one field (`AdminExcerptAbout.vue`): empty, a dashed tile that
  opens the relation's picker (`RelationModal`), the parent kept out of it,
  with what the excerpt's text links to offered under it as suggested chips;
  chosen, the relation's chip, which opens the same modal for its kind, its
  note and another subject, and a square ✕ that clears it. Opened about
  nothing, the tile is in the warning tone and says the subject was deleted.
- Under the title a quiet line says when the subject closes the excerpt
  more than its own switch: hidden while the subject is private, shown only
  by its link while the subject is open by its link only. The switch keeps
  the owner's own choice for when the subject opens.
- A target's own relations block shows the excerpts about it on a fourth
  tab, read only: a chip leads to the parent's form, opened on the excerpt
  (`?excerpt=<id>`), since only that form edits it
  (`app/components/admin/AdminRelations.vue`, `app/composables/excerpts-about.ts`).
  The block recommends a relation to an entity that has an excerpt about
  this one, first.
- Deleting a project, an event or an entry that excerpts are about asks what
  becomes of them, in the deletion pane: keep them (the default) or delete
  them too, with how many there are (`AdminExcerptsOnDelete.vue`). Excerpts of the entity
  itself go with it.
- An excerpt is edited in its parent's form by the admin and by a model
  alike: an action on it waits at the field it changes in the modal — its
  subject at «Про что» (see
  [AI in the UI](ai-in-the-ui.md)).

## How it is checked

- `tests/e2e/excerpts.spec.ts`: an entry that is only an excerpt, written in
  the modal and about a project; the deletion pane's two answers; the block
  and the modal on a phone.
- `tests/server/public-excerpts.test.ts`: who sees an excerpt where — the
  parent's access, its subject's, its privacy, the viewer, a day still to
  come.
- `tests/server/life-excerpts.test.ts`: the chronology's points and the
  Life's cards.
- A look in the browser at 960 and 375 px, in both themes: the parent's page
  with the sidebar, the excerpt's page, a target's block, the form's block
  and the modal.
