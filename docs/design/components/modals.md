# Modals

A modal is a screen of its own over the page: a relation, an access key, a
template, a file, a text in its editor. On a phone it fills the screen; on a
desktop it is a card over the page, blurred behind it. Its header is one slim
row that says what is open and holds its actions; the body below scrolls.

## When to use it

- Editing or reading one thing in depth without leaving the page under it.
- A short flow that must end in a result, such as a wizard of steps.

Not for a choice or a short note anchored to a control — that is a popup (see
[Popups](popups.md)).

## Rules

The header:

- One slim row: the kind's icon and the title, then icon buttons, then the main
  action (Save, Done) in the accent. On a phone it holds the title and one or
  two controls; nothing more.
- Say what is open: its kind, by its icon, and its name. The rest of what
  makes a modal informative — when, who, the cost, a source, the counts of
  what it holds — goes at the top of the body, not into the sticky row.
- One control per meaning: a single close, not both a back and a cancel.
- Status speaks in icons with hints. Words only for what is urgent, such as
  "Offline"; counts without noise, never "0 / 0 bytes".
- While a decision is pending — restoring a version, say — its row replaces the
  whole header rather than stacking under it, and its consequences show in the
  body, not in a popup over the text.
- Long content of two kinds goes on tabs along the header's lower edge
  (`UnderlineTabs`), not stacked one under the other.

The body:

- It sits on the modal's own ground (`bg-bg-2`). No nested box with another
  background inside it.
- Context lines — the entity, a date, a source — live in the body, not in the
  sticky header or footer.
- A sticky footer, when there is one, is as slim as the header.

Closing:

- Escape and browser Back undo exactly one step, and agree on which: the
  innermost popup or menu first, then the modal.
- A click on the blurred page behind a desktop modal closes it.
- A modal holding unsaved work asks before it closes.
- Deleting an entity is confirmed against its name in
  `app/modals/DeleteConfirmationPane.vue`.

## How it is built

- `app/components/Modal.vue` holds one `<dialog>`, opened with `showModal()`
  so it is in the top layer, and the stack of open modals; only the top one is
  shown.
- `app/composables/modal.ts` opens them — `openModal(descriptor, data)`
  resolves with the modal's result — keeps the stack, ties it to browser
  history, and keeps the dismiss layers: an open popup calls
  `registerDismissLayer`, and `dismissOneStep` closes the innermost layer or
  else the top modal. `useModalCloseGuard` asks before an unsaved modal
  closes.
- A modal is declared with `defineModal` (`app/modals/types.ts`) and lazily
  imported.
- `app/modals/ModalContainer.vue` draws it: the full screen on a phone; from
  `sm:` a card of `rounded-normal`, `border` and `shadow-xl` over a blurred
  page. Its `header` slot is sticky glass with a bottom border, `z-10`; the
  default slot is the body; the optional `footer` slot is sticky at the bottom.
  The width is the caller's, most often `max-w-140`.
- `app/modals/ModalTitle.vue` is the icon and the truncated title;
  `app/modals/ModalHeaderButton.vue` the header's buttons (see
  [Buttons](buttons.md)).

```vue
<ModalContainer class="max-w-140">
  <template #header>
    <div class="flex items-center gap-sm p-sm">
      <ModalTitle icon="arrow-cycle" :title="phrase.relation" class="flex-1" />
      <div class="flex items-center gap-xs">
        <ModalHeaderButton
          icon="delete"
          variant="delete"
          :label="phrase.delete_relation"
          @click="remove"
        />
        <ModalHeaderButton
          variant="accent"
          :label="phrase.done"
          @click="closeModal"
          >{{ phrase.done }}</ModalHeaderButton
        >
      </div>
    </div>
  </template>
  <div class="flex flex-col gap-md p-sm">…</div>
</ModalContainer>
```

(Shortened from `app/modals/relation/RelationModal.vue`.)

Popups opened inside a modal join its `<dialog>` by themselves; see
[Popups](popups.md).

## Why

- The owner rejected a header full of sentences — "Restored… · Undo · Draft
  saved…" — and a confirmation popup that covered the text; on a phone the
  stacked header took half the screen.
- A first summary modal with a bare title and a note in a grey box was called
  uninformative and cramped; the owner asked for a modal that says what is
  open — kind, name, when, who, cost, counts — and for tabs.
- A template editor whose header then held back, icon, name, owner, last run
  and a run button was rebuilt into one slim row, with the meta moved into the
  body: sticky chrome eats a phone's view.

## How it is checked

- `tests/app/modals/modal-stack.test.ts` covers the stack: closing only the
  top modal, focus given back, close guards, browser Back one modal at a time.
- `tests/e2e/modal-history.spec.ts` checks in a browser that Back closes one
  nested modal per press and that Escape undoes the same single step.
- `tests/e2e/popups.spec.ts` checks that pickers open inside their modal.
- A new modal is looked at in the browser at 375 px and on a desktop, in both
  themes.
