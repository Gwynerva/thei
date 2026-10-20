# Buttons

Thei has two button components: `Button`, for buttons in the body of a page, a
form or a card, and `ModalHeaderButton`, for the slim row at the top of a
modal. Both come in a few ranks — the one main action in the accent, the rest
neutral — and in square icon-only sizes.

## When to use it

- `Button` for an action anywhere in content: a form, a card, a toolbar, a
  list's row.
- `ModalHeaderButton` in a modal's header row: close, delete, the main action
  (Save, Done).
- Where the action is a navigation, `Button` with `to`: a link that looks as
  the button of its rank does, and `ModalHeaderButton` with `to` in a modal's
  header. Never a link styled by hand as a button.

## Rules

- One accent button per group: the main action. Everything else is neutral.
- Buttons of one rank share one style. On an AI card, correct, comment and
  decline are the same neutral square; only accept is in the accent.
- Icon-only buttons are strictly square: a `size` of `Button`, or
  `ModalHeaderButton` with an `icon` and no words.
- An icon-only button has an `aria-label` and a hint with the same words
  (`data-title-popup`); `ModalHeaderButton` sets both from `label`.
- Prefer an icon to a word where the icon says it plainly, and keep words for
  the main action and for what is urgent.
- `Button`'s default size pads with `px-sm py-xs` and is not a flex box. To
  give a text button a fixed height, make it one:
  `flex h-9 shrink-0 items-center gap-xs whitespace-nowrap`. A bare `h-8` on
  it squeezes the box and drops the label below its middle.
- In a flex button, space the icon from the words with `gap`, not a margin.
- A button that drops its words on a phone keeps its name:
  `max-sm:w-9 max-sm:justify-center max-sm:px-0` on the button,
  `max-sm:hidden` on the words, and an `aria-label`.
- A form's Save stays at the end of its header on a phone too, as a square
  with the `save` icon, its words for its name: `app/components/admin/AdminSaveButton.vue`
  on a page (`done` once all of it is saved), `ModalHeaderButton`'s
  `phoneIcon` in a modal. Once everything is saved the square shows `check`:
  a pale floppy disk alone did not say whether the save had gone through.
- "Saved" and its `check` say that something is stored, never only that
  nothing changed. A text's editor says "Saved" only for a text that is
  stored as it stands there; the text of an entity not created yet never
  was, so its button says "Save", disabled while there is nothing new to
  take into the form, its square a floppy disk. The words typed count as a
  change the moment they are typed, not when Editor.js tells of them.
- A form's Save that cannot save yet says why, from what the form still
  needs (`app/composables/form-needs.ts`): a required field left empty, by
  the label the form shows — "Still to fill in: Event title, Summary" — or
  a filled field it cannot keep, with what is wrong — "Page address: A page
  with this slug already exists". `AdminSaveButton`'s and
  `ModalHeaderButton`'s `reason` makes the button look disabled but stay
  pressable (`aria-disabled`): it is the button's hint, its label in bold and
  a line per need under it, and what a screen reader hears with it.
- A press of such a button — a tap on a phone, where no hint shows and no
  Ctrl+S exists — and Ctrl+S on such a form say the same on the line under
  the header (`app/components/HeaderErrorLine.vue`), mark the labels of the
  fields concerned in the error colour, and bring the first of them into
  view when it is out of it, gently. The line names three empty fields at
  most and counts the others ("and 4 more"); the hint names them all. Line
  and marks go as the fields are filled.
- A button disabled because there is nothing to do — all of it saved, a
  save under way — stays `disabled`. Both look the same: `off:` in
  `app/styles/main.css`, with `not-off:` for what only an acting button
  does under the pointer.
- Under a finger, small square buttons grow: `pointer-coarse:size-11`.
- A row of a list the owner orders by hand — the profile's links, the files
  of a group in a text — has a grip: a square `Button` with `dragHandle` and
  the `grip` icon, named by what it moves. A drag starts from it alone
  (`useDragSort`'s `handle`), so the row's fields and buttons stay what they
  are under the pointer, and the arrow keys on it move the row by one. Inside
  a text the grip keeps those keys from Editor.js, which would move the caret
  to another block.
- A group of files in a text is one frame of rows with hairlines between
  (`app/components/content/ContentFileGroup.vue`), headed by its title on
  `bg-bg-3`, as a table's head is — the head a gallery has too
  (`app/components/content/ContentFilesHead.vue`). A row ends with its grip, then its remove
  button, as `app/components/SortableList.vue`'s rows do; both show where the
  pointer or the focus is, and always under a finger
  (`pointer-coarse:opacity-100`), level with the file's square. The frame
  ends with a flush row that adds files: the plus under the files' squares,
  the words under their titles in `text-text-2`, turning to the accent where
  pointed at.

## How it is built

`app/components/Button.vue`:

| `variant`   | Look                                                                         |
| ----------- | ---------------------------------------------------------------------------- |
| `primary`   | The default: `bg-accent/80` and white words, full accent on hover and focus. |
| `secondary` | `bg-bg-3` and `text-text-2`, tinted with the accent on hover and focus.      |
| `raised`    | `secondary` one step off a `bg-bg-3` ground, `bg-bg-4`: a card's foot.       |
| `delete`    | Like `secondary`, turning to the error colours on hover and focus.           |

| `size`         | Box                                        |
| -------------- | ------------------------------------------ |
| `default`      | `rounded-normal px-sm py-xs`, not flex.    |
| `icon-overlay` | `size-6`, round: over a picture or a tile. |
| `icon-sm`      | `size-8`: the buttons of a card.           |
| `icon`         | `size-9`: beside a text button of `h-9`.   |
| `icon-lg`      | `size-10`.                                 |

`to` makes it a link (`TheiLink`) with the same look. `dragHandle` gives it
the grab cursor. Disabled, it fades its colours and
shows the not-allowed cursor.

`app/components/admin/AdminSaveButton.vue` takes `label`, `saving`,
`disabled` (nothing to do), `done` (all of the form saved: the `check`
square) and `reason` (why it cannot save yet; pressable, the form answering
the press with `useFormNeeds`'s `ask`).

`app/modals/ModalHeaderButton.vue` takes `label` (required), `icon`,
`variant` (`default`, `delete`, `accent`), `size` (`default`, `h-9`;
`compact`, `size-7`), `disabled` and `reason`, as `AdminSaveButton`'s. With
an `icon` and no slot it is a square of `w-9` with a hint. `phoneIcon` is the
icon its words give way to on a phone, and `phoneDone` swaps it for `check`:
both icons stay in the page, one hidden, since pointing an icon's `<use>`
elsewhere while the owner types in a text ends the browser's run of typing,
and Ctrl+Z would then stop after the first letter. `AdminSaveButton` keeps
its two squares the same way. `to`, a path in data, makes it a link with the
same look (`TheiLink` with `external`, the base path added by `sitePath()`):
the page loads in full, as the admin's other ways to the site do, and Ctrl or
the middle button opens it in a new tab. `disabled` and `reason` are a
button's alone.

```vue
<Button
  variant="secondary"
  class="flex h-9 shrink-0 items-center gap-xs max-sm:w-9
    max-sm:justify-center max-sm:px-0"
  :aria-label="phrase.share_link_extend"
>
  <Icon name="plus" />
  <span class="max-sm:hidden">{{ phrase.share_link_extend }}</span>
</Button>

<ModalHeaderButton icon="visibility" :label="phrase.view_content_section" :to="pageUrl" />
<ModalHeaderButton icon="close" :label="phrase.close_modal" @click="closeModal" />
<ModalHeaderButton variant="accent" :label="phrase.save" @click="save">
  {{ phrase.save }}
</ModalHeaderButton>
```

`app/components/admin/AdminShareLinks.vue` shows a row of text and icon
buttons of one height; `app/components/ai/AiActionRow.vue` the square buttons
of an AI card.

## Why

- The owner found the buttons of the AI page "terribly" off, their words
  slipped down, while other admin pages looked right: `h-8` on a padded,
  non-flex `Button`.
- Three styles of button in one row of an AI card read as three ranks; the
  owner asked for one neutral style for comment and decline, and the accent
  for accept alone.

## How it is checked

Looked at in the browser at a phone's width, where a label that drops or a
row that overflows shows first. E2E specs find buttons by their accessible
name, which an icon-only button must have. `tests/e2e/diary-new-entry.spec.ts`
checks what the save controls of a new diary entry say, before and after its
text is written and once the entry is made, and the reason its Create gives
under a mouse, a finger and Ctrl+S; `tests/e2e/form-needs.spec.ts` does the
same for every other form, at 1280 and 375 px.
`tests/e2e/admin-sections.spec.ts` follows the eye of a section's modal to
the section's page, and finds none in a new section's.
`tests/app/styles/off-variant.test.ts` compiles `off:`.
