# Interaction

Thei is used with a mouse, a pen, a keyboard and a finger, often on the same
site in one day. This page says how a control tells them apart: what pointing
means, what a touch screen gets instead, how hints open, and what the keyboard
must always see.

## Pointing: `hocus:`

`hocus:` is a mouse or a pen pointing at something, or the keyboard's focus on
it (`@custom-variant hocus` in `app/styles/main.css`). A touch screen never
matches it, as with Tailwind's own `hover:`: a phone reports the last tap as a
hover, and the look would stay on whatever was tapped.

- Use `hocus:` for the look of a thing pointed at or focused, rather than a
  pair of `hover:` and `focus-visible:`. `group-hocus:` follows a parent.
- A scoped `:hover` is written the same way, under `@media (hover: hover)`.
- A control that only appears on hover needs a way to show on touch —
  `pointer-coarse:` — or a phone never reaches it.

## Touch

- Small controls grow under a finger: `pointer-coarse:h-11` or
  `pointer-coarse:size-11`, as the select's compact trigger and the buttons of
  an AI card do.
- A finger has no pointing. A tap is the action; a hint comes from a long press
  (below).
- A popup of options opened on a touch screen does not put a text field in
  focus at once: the keyboard would rise over the options a finger is about to
  pick from. The select's filter waits for a tap. A search or a form, which is
  there to be typed in, takes the focus as it opens — on a phone it is a sheet
  ([Popups](../components/popups.md)).

## Hints

A hint is the short text a control or a mark carries in `data-title-popup`,
drawn by `app/components/TitlePopup.vue`. When it shows is decided in one
place, `app/composables/press-hint.ts`, with `app/composables/press-hint-dom.ts`
reading the page:

- a mouse or a pen gets it after a pause, and pressing hides it until the
  pointer leaves, so a hint never covers the menu its button opens;
- the keyboard gets the hint of whatever it moves the focus to, and Escape takes
  it away first;
- a tap on something with no action of its own — a status icon, a date —
  shows it, another tap hides it;
- on a link or a control a tap stays its action, and the first long press shows
  the hint above the finger; a second long press is the system's again.

Which elements get a hint, how its text is written and the attributes that
steer it are on [Hints](../components/hints.md).

- Every icon-only control has an `aria-label` and the same words as its hint.
  `ModalHeaderButton` does both from its `label`.
- Mark an element whose action lives only in a script handler
  `data-title-popup-press="hold"`, so that a finger's tap acts and a long
  press shows the hint, as on a button.
- The links in a text, and the chips that stand for links elsewhere, show a
  card of what they lead to, `app/components/LinkHoverPopup.vue`, under the
  same rules: a tap follows the link, the first long press shows the card.

## Keyboard focus

- The browser's outline is off for buttons, fields and selects
  (`app/styles/main.css`), so every focusable control draws its own focus.
- A control with no border to change shows a ring: `focus-visible:ring-2
focus-visible:ring-accent`, `ring-inset` where it sits flush in a list.
- A field turns its border to `border-border-3` while in focus.
- Escape undoes one step: the innermost popup or menu first, then the modal
  under it, the same step browser Back undoes (see
  [Modals](../components/modals.md)).
- Whatever closes hands the focus back to what opened it: a select to its
  trigger, a modal to the control that opened it.
- Keyboard shortcuts go through one helper, `app/composables/shortcut.ts`: a
  chord by its physical key (`KeyboardEvent.code`) with the platform's own
  modifier, ⌘ on a Mac and Ctrl elsewhere, so it works on any layout; a key
  that stands for its character, as "/" does, by what it types. None acts
  while typing in a field unless it is meant to, nor with a modal in front.
- The site does not name its keys: no hint, foot or badge says «Ctrl K» or
  «Enter — open». The keys work for those who know them; the room goes to
  what is shown.

## Why

- A phone that keeps the hover look on the last thing tapped looks broken;
  `hocus:` was made so that a touch never matches.
- A long press that showed a hint every time would take the system's menu away
  from links; the first press is the hint's, the second the system's.

## How it is checked

- `tests/app/styles/hocus-variant.test.ts` compiles `hocus:` and checks what it
  matches.
- `tests/app/composables/press-hint.test.ts` plays every gesture as a sequence
  of events; `tests/app/styles/press-hint-selectors.test.ts` keeps the CSS
  that lifts text selection during a long press in step with the script's list
  of controls.
- `tests/app/composables/input-modality.test.ts` tells a focus moved by the
  keyboard from one moved by a pointer.
- `tests/e2e/press-hints.spec.ts` presses, taps and points in a real browser.
