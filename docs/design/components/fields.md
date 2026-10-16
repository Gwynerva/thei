# Fields

A field of a form is a `Field` holding a `FieldLabel`, the control itself and,
when it needs one, a `FieldHint`. The label names the field, focuses its
control when clicked, marks it required, and — in an entity's form — is where
whatever an AI proposes for the field waits.

## When to use it

Every input of an admin form: text, a select, dates, a switch, the editor of a
text. A control on its own in a toolbar or a search row needs no `Field`; it
names itself with an `aria-label`.

## Rules

- Wrap each field in `Field`, label first.
- Give every field a label. A switch with no label of its own has its words
  beside it, which count as one (`FieldToggle`).
- The control the label should focus carries `data-label-focus`;
  `FieldInput`, `FieldTextarea`, `FieldSelect` and `FieldDateButton` already
  do.
- A note on how to fill the field goes in `FieldHint`, in the quieter
  `text-text-2`.
- In an entity's form, a field that an AI action can change names its place:
  `<Field ai="…">`. Its label then shows the proposals waiting for it (below).
- Controls sit on `bg-bg-1` with a `border-2 border-border-1` that turns
  `border-border-3` on hover and in focus; errors turn it to
  `border-border-error`.
- Suggestions of the site's own — recommended tags, candidates — wait next to
  the field they are about, never in the form's header.

## The ✦ at a label

When an AI proposes something for a field, its label turns to the accent and a
✦ stands beside it (`AiFieldOffer`). The proposal opens over it after the
pointer rests on the ✦ for a moment, and stays while the pointer moves into it;
a tap or the keyboard open it too. It is drawn as its session's card draws it:
take it into the form, decline it or comment on it. Several proposals at one
field are gone through one at a time, the pager (‹ 1/2 ›) at the left of the
card's own row of buttons. A text edit opens in the text's own editor instead.

With AI off, or nothing proposed, there is no ✦ and the label is plain. See
[AI in the UI](../patterns/ai-in-the-ui.md).

A file's description («Описание файла», "File description") is the one
field of a file (`app/components/FileDescriptionField.vue`): it stands in
every window of a file once the file is in the library, and is saved on its
own — a button under it, or Ctrl+Enter — since it belongs to the file and its
variants, not to the place the window was opened from. Where the window is
about one place it is marked «Глобально» (`global`); as the editor's last step
it is `required`, has no button of its own (`embedded`), and the window's
«Готово» saves it. What an AI proposes for it waits at
its label as for an entity's field (`provideFileAi`), its new words compared
with the old. See [File window](file-window.md).

## How it is built

- `app/components/field/Field.vue` — the column (`flex flex-col gap-xs`), and
  the `ai` place it provides to what is inside (`app/composables/field-ai.ts`).
- `app/components/field/FieldLabel.vue` — `font-semibold tracking-tight`;
  `required` adds an accent asterisk.
- `app/components/field/FieldHint.vue` — `text-sm tracking-tight text-text-2`.
- `app/components/ai/AiFieldOffer.vue` — the ✦ and its popup.
- `app/components/FileDescriptionField.vue` — a file's description, read and
  saved through any file of its family over the version it was read at.

```vue
<Field ai="field:title" class="min-w-50 flex-1">
  <FieldLabel required>{{ phrase.event_title }}</FieldLabel>
  <FieldInput v-model="eventData.title" type="text" required />
</Field>
```

(From the event form, `app/pages/admin/events/components/AdminAddEditEvent.vue`.)

The other controls in `app/components/field/`: `FieldInput`, `FieldTextarea`,
`FieldSelect` ([Select](select.md)), `FieldToggle`, `FieldOptions`,
`FieldDiscreteBar`, the date pickers, `FieldSynonyms` and
`FieldContentEditor`.

## Why

- A proposal shown as a block under its field made the form heavy, and a
  pager on a row of its own was "too much space for so little": the owner
  moved both to the label.
- The owner removed a header button that counted suggested tags as too
  intrusive; a suggestion belongs beside its field.

## How it is checked

- `tests/server/ai-actions-contract.test.ts` fails when an action's field has
  no place in its form.
- `tests/e2e/ai-entity.spec.ts` opens a proposal at a label and checks it with
  `expectPopupUsable`.
