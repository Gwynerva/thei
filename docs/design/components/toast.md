# Toast

A toast is the short word the admin says after something is done — «Declined»,
«Copied», «Started» — with at most one action beside it, such as "Never offer
again" or "Open". Thei has one, `app/components/AppToast.vue`, mounted once by
the admin's layout (`app/layouts/admin.vue`), and it is set from anywhere with
`showToast()` (`app/composables/toast.ts`). This page is for anyone who says
something with it.

## When to use it

- The outcome of a click that leaves nothing else on screen to show it: a
  proposal declined, a check that found nothing new, a session started
  elsewhere.
- One way back or on from it, as its action: undo what was forgotten, open
  what was started, never offer it again.

Not for:

- an error inside a form or a modal — that stays by what failed, in
  `text-text-error`, as long as it holds;
- a status that lasts — that is an icon with a hint
  ([Hints](hints.md));
- anything to be read at leisure or decided — that is a modal or a popup.

## Rules

- One at a time: a new toast takes the place of the last.
- Short: a few words, no full stop for one sentence; the owner's words in it
  go through the formatter (`publicText()`).
- At most one action, named by a verb.
- It goes by itself: `TOAST_MS`, or `TOAST_ACTION_MS` when it has an action,
  so the action can be reached. A mouse or a pen resting on it, or the focus
  in it, holds it — never a finger; once it fades out nothing holds it any
  more.
- A press anywhere else takes it away at once: the owner has gone on.
- It speaks of the page it was said on: gone to another page, it goes too.
  Said of a form's unsaved state («save it»), it goes once the form is saved
  (`hideToast(id)`).
- It stands just under the admin bar and the page's sticky header (the height
  `useStickyHeaderContext()` keeps), never over a form's own buttons, and
  never at the foot of the window, where it would cover the composer of a
  session or a form's last field.

## How it is built

- `showToast(text, action?)` sets the page's one toast and returns its id;
  `useToast()` reads it.
- `AppToast` shows it as a `popover="manual"` in the top layer, so it is seen
  over an open dialog too, `role="status"` for a screen reader.
- Its look is the hint's, reversed: `bg-text-1` and `text-bg-1`, `text-sm`,
  `rounded-normal`, `shadow-lg shadow-shadow-2`. The action is bold in
  `text-bg-accent`, underlined where it is pointed at, ringed in the same
  colour for the keyboard, and as tall as a finger needs under one
  (`pointer-coarse:min-h-11`).
- It fades in and out with `transition-opacity`; fading out, it lets the
  pointer through.

```ts
showToast(phrase.value.ai_toast_declined(1), {
  label: phrase.value.ai_action_never,
  run: () => aiApi.never(actionUuid),
});
```

## Why

- A toast at the foot of the window covered what the owner was writing in;
  under the admin bar it covers nothing that is typed. Just under the admin
  bar it still covered a form's sticky header on a phone — «Taken into the
  form — save it» over the very «Save» it asked for, for four seconds — so it
  stands under that header too.
- A toast pointed at while it faded out was held for ever, unseen in the top
  layer, and took the clicks meant for the page under it.
- On a phone a finger lifted where a toast then appeared left a hover behind
  it, which held «Taken into the form — save it» over the form's first field
  until the next tap elsewhere, however long that was, over the fields the
  owner went on to. A finger holds nothing now, and the next press
  anywhere takes the toast away.

## How it is checked

Looked at in the browser, in both themes and at a phone's width: over a
modal, with an action reached by the pointer, the keyboard and a finger.
`tests/e2e/ai-templates.spec.ts` reads the toasts a check leaves.
