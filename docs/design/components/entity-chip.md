# Entity chip

`app/components/EntityChip.vue` names another entity in a line of a public
page: a project, an event, a diary entry by its day. This page describes what
the code does; it adds no rule of its own yet, and the rules proposed for it
wait for the owner's word.

## What it is

- One line: the entity's name, and its picture along the right edge,
  dissolving into the chip (`app/components/MediaEdge.vue` with `fade="chip"`),
  or its kind's icon there while it has no picture.
- Of the family of the relation chip and the file-usage chip
  (`app/components/admin/AdminRelationChip.vue`,
  `app/modals/asset-modal/AssetPlaceChip.vue`): the plain ground, the
  entity's own accent on the border under the pointer.
- A link where the reader may open the entity. One they may not is its
  codename in italics, leading nowhere.
- `size="sm"` on a card or in a line of small words; `onDark` over a banner's
  dark hero, where it is a pane of the hero as the hero's pills are.

## Its card

- Resting on a chip, reaching it with the keyboard or a first long press shows
  the entity's card: the card of a link in a text
  (`app/components/content/EntityLinkPreviewCard.vue`), opened the same way
  ([Popups](popups.md), [Interaction](../foundations/interaction.md)).
- The card is drawn from what the page already holds of the entity
  (`app/composables/entity-cards.ts`): nothing is asked of the server, so it
  never says more than the page was given. One the reader may not open shows
  its codename and the words every secret is given.
- One popup serves the page, `app/components/EntityCardPopup.vue` in
  `app/layouts/public.vue`. Anything else that stands for an entity takes the
  same card with `v-entity-card`: the tokens of several related entities on a
  card, a row of the relations block, a section's card, a tag, a tile of the
  sidebar's links and neighbours, a place in a file's window. A link to
  another site takes it too, with what the page holds of the site.

## Where it stands

- Over a page's title, after the words that say what the page is: a section's
  project, an excerpt's parent and what it is about
  (`app/components/public/PublicPageParent.vue`;
  [Excerpts](../patterns/excerpts.md)).
- Over an excerpt's heading on its parent's page, naming what it is about.
- On a card, naming what its subject belongs to
  (`app/components/public/PublicParentLink.vue`), and the one entity it is
  related to (`app/components/public/PublicEntityLinks.vue`).
- On a card of the Life, one for each excerpt of a diary entry or an event:
  the excerpt's title, with the picture and the card of what it is about
  (`app/components/public/PublicContentCard.vue`).
- In a search result, what the result is a part of — a section's project, an
  excerpt's parent — and, for an excerpt, a second chip after «about»: what
  it is about (`app/components/search/SearchResultCard.vue`;
  [Search](../patterns/search.md)).
