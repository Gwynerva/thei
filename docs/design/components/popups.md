# Popups

A popup is a surface that opens by an anchor: a select's options, a menu, a
picker, a small form, a proposal at a label, a link's card. Thei has one
popup, `app/components/FloatingPopup.vue`, and everything that floats by an
anchor is built on it, so every popup looks, moves and closes alike. Hints —
the short texts of `data-title-popup` — are placed by the same core and drawn
in a look of their own ([Hints](hints.md)); the menus Editor.js draws itself
are placed by it too and wear the same surface. This page is for anyone who
adds a popup, changes one or puts something into one.

## When to use it

- Anything that opens by a control or by words and closes again: use
  `FloatingPopup`.
- A choice of one among several: use `FieldSelect` ([Select](select.md)),
  which is a `FloatingPopup` inside.
- A note on an element: a hint, `data-title-popup`, never a popup.
- A task of its own, with a title, several sections or a long form: a modal
  ([Modals](modals.md)), not a popup.

## Anchored or a sheet

On a phone a popup either stays by its anchor or comes up from the bottom as a
sheet. Mark it `complex` when it is a **form, a search, or levels to go down**:
it is a sheet below `sm`, by its anchor above. Leave a **quick, small** popup
plain — a menu of a few items, a select, a date, a link's card, a proposal —
and it stays by its anchor on every screen.

The complex popups today:

- choosing a link — the inline Link and the "@" (`ContentInlineLinkControls`),
  the link block, a mention in the AI composer (`AiComposer`), the entity
  search of a relation (`RelationModal`);
- the hint editor (`ContentHintControls`), a link's note
  (`ExternalLinksEditor`), the forms of access links and access keys
  (`AdminShareLinks`, `SettingsApiTokens`), the forms of the AI's memory and
  dictionary (`AiRememberPopup`, `AiTermPopup`), a comment on a proposal
  (`AiActionRow`), asking at a field's ✦ (`AiFieldOffer`), the about page's
  forms;
- a text's history in the editor, the date range (`FieldDateRangePopup`), the
  sessions of an entity with their composer (`AiEntityButton`).

A new popup takes the side of the rule its content falls on. A sheet takes the
width of the screen and up to 85% of its height; what it holds is centred when
it has a width of its own.
A sheet never hides what it was opened from: an anchor it would cover is
scrolled up to just above it — the page, or the modal it is in — so the field
asked about stays in sight.

## Rules

- **Never build a popup of your own.** No surface placed by hand, no
  `useFloating` or `computePosition` outside `app/composables/popup-placement.ts`
  and `app/composables/editor-popover-layer.ts`, no `<Teleport>` outside
  `FloatingPopup` and `TitlePopup`. A need the popup does not meet grows the
  popup.
- **The popup draws the surface; its content draws none.** No border, ground,
  radius or shadow on what goes in. A card that also stands on its own on a
  page drops its surface inside a popup, as the link cards do with `flush`.
- **Room by density, one of three:** `compact` (0.375rem) for a row of icon
  buttons, `list` (`xs`) for menus, lists and pickers, `card` (`sm`) for text
  and forms. `none`, the default, is for a content that scrolls inside itself
  and keeps its own room, as the select's list does. The room at the popup's
  edge equals the gap between the blocks inside it.
- **Nothing is cut off.** With a density, the popup scrolls what it holds
  when the window is too short for it. With `none`, the content scrolls
  itself within `--floating-popup-available-height`, as the select's list,
  the ✦ menus (`AiSessionsMenu`) and a proposal at a label do.
- **Placed, it keeps its side while it stays open.** What it holds may grow —
  an answer coming into a ✦'s box — and it scrolls in the room that side has
  rather than jump over its anchor (`usePopupPlacement`). Opened again, it
  chooses afresh.
- **Rows of a menu are `popup-item`:** one height, one rounding, one shade
  under the pointer; a row that deletes shades with
  `[--popup-item-hover:var(--color-bg-error)]`. The row Enter would choose is
  ringed (`ring-2 ring-accent/60 ring-inset`), as in the select.
- **The arrow is on by default.** It points at the middle of the anchor, or,
  for an anchor as wide as the popup, near the edge the popup is aligned to,
  and goes when it would point past the anchor. Turn it off (`:arrow="false"`)
  only for a popup that covers its anchor.
- **The anchor shows its popup is open.** An element anchor carries
  `data-popup-open` while it is: a plain control looks pressed by the base
  rule of `app/styles/main.css`, and a control with a colour of its own says
  how it looks with `popup-open:`, as `Button` and `ModalHeaderButton` do —
  the look it has under the pointer. Words are no element: their popup points
  at a range (`rangeAnchor()`), and they are marked with a CSS highlight. An
  element inside a text being edited is never marked, since that would change
  the text.
- **It goes where its anchor is.** The popup teleports into the `<dialog>` its
  anchor sits in, else into `body`: a modal is a dialog in the top layer, and
  a popup sent to the body would open beneath it. It stays there while it
  fades out, its anchor gone: moved to the body then, a hint in a modal
  vanished at once.
- **One stacking scale:** popups `z-9998`, hints `z-9999`, sticky headers
  `z-10` inside their dialog. No new values. Small values inside one component
  — the badges over a tile, Editor.js's own levels of a menu — are its own
  stacking, not this scale.
- **It moves in and out from its arrow:** fading and growing from the arrow's
  tip as it opens, back into it as it closes; a sheet slides up. With reduced
  motion it appears and goes at once, as everything does. Editor.js closes its
  own menus at once.
- **It closes on a click outside and on Escape.** Escape and Back close the
  popup first, then the modal under it. A click in a popup opened from inside
  it — a select in a picker — is inside it.
- **It follows its anchor** as the page scrolls, and hides with an anchor
  scrolled out of the box it scrolls in.
- **It turns where there is room:** to the other side first, then, for one
  above or below its anchor, to the sides, level with the anchor's edge
  (`popupFallbacks()`): a tall form beside its chip rather than cut short
  over it. Going past the window along the side it stands on is mended by
  sliding it along. A popup that fits nowhere whole slides over its anchor
  when it is allowed to (`shiftCrossAxis`), and its arrow goes, since it
  would point from inside the anchor.

## How it is built

`FloatingPopup` takes:

| Prop                              | What it does                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `anchor`                          | An element, or a virtual one with a rectangle and a `contextElement`.                 |
| `v-model:open`                    | Whether it is open.                                                                   |
| `placement`, `fallbackPlacements` | Where it opens, `bottom-end` by default, and where it turns to when there is no room. |
| `shiftCrossAxis`                  | Lets it slide over its anchor's side to stay on the screen.                           |
| `maxWidth`, `fitContent`          | 20rem wide at most, or as wide as what it holds.                                      |
| `density`                         | `none`, `compact`, `list` or `card`, as above.                                        |
| `arrow`                           | On unless turned off.                                                                 |
| `complex`                         | A sheet on a phone.                                                                   |
| `closeOnOutside`, `closeOnEscape` | On unless turned off, as a link card does, whose closing is the hints'.               |

Its tip stands 3px from the anchor and the popup 8px from the window's edge,
the same for every popup (`POPUP_GAP`, `POPUP_VIEWPORT_PADDING`). It emits `opened` once it is drawn in place, so the focus can go in;
`dismiss` with `outside` or `escape` the moment it is put away without a
choice, before the click goes on to wherever it was aimed; and `closed` once
it has gone. It gives what it holds the room left on the screen as
`--floating-popup-available-height` and `--floating-popup-available-width`,
and the anchor's width as `--floating-popup-anchor-width`, for a list as wide
as the field it opens under. Before its room is known it is measured at its
full width: left to shrink to what it holds, a content sized by its box made
it a thin, tall strip that turned beside its anchor and stayed squeezed there. A content that scrolls takes its height from the
first:

```vue
<FloatingPopup
  v-model:open="open"
  :anchor="trigger"
  placement="bottom-start"
  :fallback-placements="['top-start']"
  density="list"
>
  <button class="popup-item flex items-center" @click="rename">
    <Icon name="edit" />
    {{ phrase.rename }}
  </button>
</FloatingPopup>
```

`app/composables/popup-placement.ts` is the core every popup is placed by:
`popupMiddleware()` lists the steps — the gap, turning over, sliding along
the edge, the room left, the arrow, hiding with the anchor — and
`usePopupPlacement()` runs them for a Vue component. `POPUP_ARROW_SIZE`,
`POPUP_ARROW_EDGES` and `POPUP_ARROW_TIP` are the arrow's square, the two
sides that carry the border round it and its eased tip; `popupArrowStyle()`
and `popupOrigin()` put it on the edge and grow the popup from it.
`rangeAnchor()` turns words into an anchor: the last of their lines, wherever
the text has moved.

The others built on it:

- **Hints**, `app/components/TitlePopup.vue`: the reversed colours, a smaller
  arrow and no border, `shadow-hint` ([Hints](hints.md)).
- **Link cards**, `app/components/LinkHoverPopup.vue`: one popup for every link
  a selector finds in a root, opened as a hint is — on hover, on focus, on a
  first long press. Its cards are `flush`.
- **Editor.js's menus**, `app/composables/editor-popover-layer.ts`: Editor.js
  draws the settings of a block and the inline toolbar itself. The layer lifts
  each tree into the top layer, so a modal's scrolling never clips it, places
  it with `popupMiddleware()` — the settings beside their button, the toolbar
  under the last line of the selected words — and draws the arrow;
  `app/styles/editor.css` gives it the popup's surface and motion. On a phone
  the block's settings are Editor.js's own sheet, styled as ours; Editor.js
  turns to it at its own layout's width, 650px, a little wider than `sm`.

## Why

- One popup was the owner's decision after the prototypes: one look, one
  motion and one way of closing everywhere, the editor's own menus included.
- The arrow and the pressed anchor say where a popup came from when several
  controls sit close together.
- On a phone a form or a search by a small anchor leaves the keyboard no room
  and the fingers no target; a sheet gives both. A menu of three items as a
  sheet would be a long way for a short choice.
- The content draws no surface so that no popup shows two borders.

## How it is checked

- `tests/app/components/popup-usage.test.ts` fails when anything outside the
  core places a popup, teleports, or stacks at the popups' heights.
- Every new popup is checked in e2e with `expectPopupUsable`
  (`tests/e2e/helpers/popup.ts`) at 1280×800 and at 375×812: whole in the
  window, on top where it is drawn, inside the open dialog, its first control
  clickable, and, by an element, the anchor marked and the arrow pointing at
  it.
- `tests/e2e/popups.spec.ts` holds the cases of placement — inside a modal, at
  the bottom edge, over the editor.
