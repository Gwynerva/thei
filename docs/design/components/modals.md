# Modals

A modal is a screen of its own over the page: a relation, an access key, a
template, a file, a text in its editor. On a phone it fills the screen; on a
desktop it is a card over the page, blurred behind it. Its header is one slim
row that says what is open and holds its actions; the body below scrolls.

## When to use it

- Editing or reading one thing in depth without leaving the page under it.
- A short flow that must end in a result, such as a wizard of steps.

Not for a choice or a short note anchored to a control — that is a popup (see
[Popups](popups.md)). A file opens in a window of its own kind, described in
[File window](file-window.md).

## Rules

The header:

- One slim row: the kind's icon and the title, then icon buttons, then the main
  action (Save, Done) in the accent. On a phone it holds the title and one or
  two controls; nothing more. Save is a square with a floppy disk there
  (`ModalHeaderButton`'s `phoneIcon`).
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
  background inside it. A text's editor and the comparison in its place sit
  on the page's ground instead (`ModalContainer`'s `ground="page"`, `bg-bg-1`,
  and the frame's `ground: 'page'` for its shell), so a text is written on
  what it is read on, its blocks looking as they do on the page.
- Context lines — the entity, a date, a source — live in the body, not in the
  sticky header or footer.
- A sticky footer, when there is one, is as slim as the header. A text's
  editor keeps what the text holds and when it was last kept there, in sight
  however long the text, rather than after its last block.

Closing:

- Escape and browser Back undo exactly one step, and agree on which: the
  innermost popup or menu first, then the modal.
- A click on the blurred page behind a desktop modal closes it — one step,
  as Escape is: with a popup open, the press closes the popup and the click
  nothing more. A card standing in another's place, as the review of a text
  does in its editor's, is left by that click instead (`ModalContainer`'s
  `dismiss`).
- A modal holding unsaved work asks before it closes.
- Deleting an entity is confirmed against its name in
  `app/modals/DeleteConfirmationPane.vue`.

Opening and waiting:

- A modal is on screen the moment it is opened. Until its code has arrived,
  a shell of its frame stands in for it — the same card, file window or
  screen, with its title — and closes as the modal would. The modal then
  fills it in.
- Declare the frame with the modal (`defineModal`'s third argument): `card`
  with its width, `file` for a file's window, `screen` for a picker that fills
  the window, `sheet` for one that moves by itself. Its title is worked out
  from the data the modal is opened with and matches the modal's own.
- What a modal fetches, it fetches after it has opened, and waits for in its
  own frame. Never fetch before `openModal`: the screen shows nothing in the
  meantime. A place that knows a file only by its uuid opens the window with
  the uuid.
- The wait is the `loading` icon of `app/modals/ModalWaiting.vue`, which
  shows only once a transition's length has passed, so a quick open never
  flashes it. What arrives later in a panel holds its place meanwhile — a
  file's facts drawn `pending`, placeholders of the chips to come — rather
  than pushing the rest down when it comes.
- A choice that depends on an answer still due is drawn from the start,
  waiting (`aria-busy`), and goes with a transition if the answer rules it
  out: the picker's "Reuse" waits for the library's answer, which its flow
  asks for along with the picker's code.

Flows:

- Modals that replace one another — a wizard, a file's details handing over
  to its editor and back — run in one `runModalFlow`. The dialog stays open
  between two steps: the step that left stays under the next one until that
  one is in, and a wait that lasts shows the frame of the step that left,
  waiting.
- A flow begun inside a modal covers it between steps; it is shown again only
  when the flow is over.
- A step loads its code ahead for the steps that may follow
  (`preloadModal`), so going on costs no wait.

Motion:

- A modal fades in over what it covers, and out from over what it uncovers,
  at the site's one transition; a layer replaced by another stays whole under
  it until that one is in, so the page never shows through. With reduced
  motion all of it is at once.
- A shell that was seen gives way by fading off the modal drawn beneath it;
  one up for less than a transition's length, whose wait never showed, goes
  at once, since it was still coming in with its layer.
- Each layer, and the modal and the shell in it, is a stacking context of its
  own (`isolate *:isolate`), so what fades lies above what it covers all the
  way: a z-index inside the one beneath — Editor.js has several — never
  reaches over it, and nothing jumps to the top once the fade is done.
- The blurred page under cards is one, the dialog's own, beneath every layer
  while a card is on the stack, and it fades by itself: a blur inside a
  fading layer draws nothing until the fade ends, and then snaps in. A card
  over a card crosses with it — the covered one gives way as the new one
  comes, and comes back as that one goes — since cards differ in size and
  neither may vanish at once from around the other.

## How it is built

- `app/components/Modal.vue` holds one `<dialog>`, opened with `showModal()`
  so it is in the top layer, and its layers: one per open modal, and the wait
  of a flow between two steps. Only the top one is shown, except while one
  fades in over another; the ones beneath are `inert` and `aria-hidden`.
  Before a layer is hidden so — covered, or leaving — the focus it holds goes
  to the dialog, and from there to the new top layer or, once the dialog
  closes, back to what opened it. The dialog closes once the last layer has
  faded out.
- `app/composables/modal.ts` opens them — `openModal(descriptor, data)` puts
  the modal on the stack at once and resolves with its result — keeps the
  stack, ties it to browser history, and keeps the dismiss layers: an open
  popup calls `registerDismissLayer`, and `dismissOneStep` closes the
  innermost layer or else the top modal. `useModalCloseGuard` asks before an
  unsaved modal closes. A text's editor counts as unsaved what is on the
  screen: it reads its text before it decides, so a word typed a moment ago —
  before Editor.js has told of it — asks too, and Ctrl+S then Escape saves it
  and closes without asking. `runModalFlow` marks a flow, `modalWait` is its wait
  between two steps, and `preloadModal` loads a modal's code ahead.
- A modal is declared with `defineModal` (`app/modals/types.ts`), with its
  frame, and lazily imported.
- `app/modals/ModalShell.vue` draws a frame waiting; a modal that loads its
  data draws it too, and puts a failure and its retry in its default slot, as
  `app/modals/upload-settings/ModalEditFile.vue` does.
  `app/modals/ModalScreenBar.vue` is the title row of a screen and of its
  shell. `app/modals/layer-motion.ts` fades the layers and the shells.
- `app/modals/ModalContainer.vue` draws it: the full screen on a phone; from
  `sm:` a card of `rounded-normal`, `border` and `shadow-xl` over the blurred
  page `Modal.vue` draws under every card. Around the card a click closes it.
  Its `header` slot is sticky glass with a bottom border, `z-10`; the default
  slot is the body; the optional `footer` slot is sticky at the bottom. The
  width is the caller's, most often `max-w-140`; `ground="page"` puts it on
  `bg-bg-1`.
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

Its descriptor says how the shell draws it while its code loads — the same
width, icon and title:

```ts
export const relationModal = defineModal(
  'relation',
  () => import('./RelationModal.vue'),
  {
    kind: 'card',
    width: 'max-w-140',
    icon: 'arrow-cycle',
    title: (data) =>
      data.relation ? phrase.value.relation : phrase.value.related_entity_add,
  },
);
```

(From `app/modals/relation/modal.ts`.)

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
- On a slow network a step of a wizard used to close, leave the page bare
  while the next one's code and data came, and only then open it: "it closed
  — and nothing, something broke". The picker showed only "Upload" at first
  and "Reuse" a moment later. Hence the frame at once, the flow that keeps the
  dialog open, and the choice that waits in place.

## How it is checked

- `tests/app/modals/modal-stack.test.ts` covers the stack: closing only the
  top modal, focus given back, close guards, browser Back one modal at a time,
  a modal on the stack before its code, a flow's wait between two steps.
- `tests/e2e/modal-slow-network.spec.ts` slows chunks and the file storage's
  answers down and checks that each frame shows its title at once and that,
  frame by frame, the dialog never closes or lets the page through mid-flow.
- `tests/e2e/modal-history.spec.ts` checks in a browser that Back closes one
  nested modal per press, that Escape undoes the same single step, and that
  no layer covered or closed is hidden while it holds the focus.
- `tests/e2e/popups.spec.ts` checks that pickers open inside their modal.
- A new modal is looked at in the browser at 375 px and on a desktop, in both
  themes.
