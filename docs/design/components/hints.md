# Hints

A hint is the small note that appears beside an element: the whole of a title
cut short, the name of an icon-only button, what a count counts. Thei draws
every hint itself, from the element's `data-title-popup`, in one look — the
reversed colours, small text, a few lines at most. This page says which
elements get one and how its text is written; when a hint opens under a
mouse, a finger or the keyboard is on [Interaction](../foundations/interaction.md).

## When to give one

- **An element whose text may be cut.** Anything truncated or clamped gets the
  whole text as its hint. Mark the element `data-title-popup-clipped` and each
  part that can be cut `data-title-popup-clip`: the hint then shows only when
  something is actually cut off.
- **An element that carries more than it shows.** An icon-only control, a
  count, a compact badge, a status mark: the hint says what it is in words.

Not for words already on screen in full, and not for anything long: a hint
that needs more than a few sentences belongs on the page, or in a popup.

## Rules

- **Never the native `title`.** No element of Thei carries a `title`
  attribute: the browser's tooltip looks like no other part of the site, waits
  its own delay, never shows on a touch screen and cannot be laid out. A hint is
  always `data-title-popup`. A frame is named with `aria-label`, which gives it
  its accessible name without a tooltip. (A component's own `title` prop, such
  as `ModalTitle`'s, is not the attribute and is fine.)
- Keep a hint short and laid out: a name, a line or two, a few sentences at
  most. Never a paragraph.
- Write it with the hint's own means, not raw text glued together: separate
  lines, the gap between groups, bold and italic spans, a quieter second line,
  a clamp. Build it with `titlePopup()` rather than joining strings by hand.
- Lay it out as the existing hints do: the name of the thing in bold first when
  the hint describes it; a note, a reason or a kind after it, in italic — the
  quieter second line.
- Clamp text that can run long — the owner's note, a reminder — to three lines
  with `clamp: true`.
- An icon-only control's hint and its `aria-label` say the same words.
- The owner's words in a hint go through the formatter (`publicText()`), as
  everywhere they are shown.
- A hint is never built as a popup of its own; it is always
  `data-title-popup`.

## How it is built

`app/composables/title-popup-content.ts`:

- `titlePopup(...lines)` returns the attributes to bind: `data-title-popup`,
  the plain text with one line per `\n`, and, only when something is
  formatted, `data-title-popup-rich`. A line is a string, a span
  `{ text, bold, italic, clamp }`, or an array of both on one line. An empty
  line — `note && { text: note, italic: true }` — is dropped, and with nothing
  left there is no hint at all.
- `TITLE_POPUP_GAP` is a short break between groups of lines. It only survives
  between two lines with text, so it goes with the line it introduces.
- `reminderTitlePopup(badge, reminder)` is the badge of an entity with a
  reminder: the badge, a gap, then the reminder in italic, clamped.
- `readTitlePopup(plain, rich)` is what the page reads back: the rich form when
  it is there, the plain text otherwise, where a blank line reads as a gap.
  The owner's words are never parsed for markup; formatting is only what
  `titlePopup()` put into the rich form.

`app/components/TitlePopup.vue` draws it: `bg-bw-reverse` and `text-bw`,
`text-xs`, at most `max-w-75` wide, one at a time, below a pointer and above a
finger. A gap is a short blank, a bold span is `font-semibold`, a clamped line
is `line-clamp-3`.

The attributes the page reads (`app/composables/title-popup-dom.ts`):

| Attribute                       | Meaning                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `data-title-popup`              | The hint's text, one line per `\n`.                                                         |
| `data-title-popup-rich`         | The formatted form `titlePopup()` writes; never written by hand.                            |
| `data-title-popup-clipped`      | Repeats text on screen: shown only when a part marked `data-title-popup-clip` is cut short. |
| `data-title-popup-clip`         | A part of a `data-title-popup-clipped` element that can be cut.                             |
| `data-title-popup-label`        | The control's own visible label: no hint while it is on screen.                             |
| `data-title-popup-press="hold"` | An element whose action lives only in a script handler: a tap acts, a long press hints.     |
| `data-title-popup-press="tap"`  | A control whose tap should show the hint, as on a thing that does nothing.                  |

A card that may cut its title, its description and its note
(`app/components/public/PublicCompactResourceItem.vue`):

```ts
const popup = computed(() => ({
  ...titlePopup(
    { text: props.title, bold: true },
    TITLE_POPUP_GAP,
    description.value,
    TITLE_POPUP_GAP,
    note.value && { text: note.value, italic: true },
  ),
  // The popup repeats what is shown, so it only speaks when something is cut.
  'data-title-popup-clipped': '',
}));
```

and, simplified, its template:

```vue
<a v-bind="popup">
  <strong class="truncate" data-title-popup-clip>{{ title }}</strong>
  <span class="line-clamp-2" data-title-popup-clip>{{ description }}</span>
</a>
```

An icon-only button needs only the words:

```vue
<Button
  variant="secondary"
  size="icon-sm"
  :aria-label="phrase.ai_action_comment"
  :data-title-popup="phrase.ai_action_comment"
>
  <Icon name="comment" />
</Button>
```

## Why

- A cut title with no way to read it whole is lost text; a hint that repeats
  what is fully on screen is noise. The clip markers give the first and spare
  the second.
- A wall of text in a hint cannot be read before it goes away. The owner asked
  for hints kept short and laid out with the hint's own lines, gaps and
  emphasis.

## How it is checked

- `tests/app/components/native-title.test.ts` fails when an element of a
  template has a `title`, or a script sets one.
- `tests/app/composables/title-popup-content.test.ts` covers how lines, gaps
  and spans are written and read back.
- `tests/app/composables/press-hint.test.ts` and `tests/e2e/press-hints.spec.ts`
  cover when a hint shows.
