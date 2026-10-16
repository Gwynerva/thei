# Thei design

These pages are the rules of how Thei looks and behaves on screen — the public
site and the admin, their forms, modals and popups — and the owner's decisions
behind them. They bind like `AGENTS.md`, for people and for agents alike.
Before changing the interface, read this page and the pages of whatever the
change touches.

The pages are written from the code and kept true to it. A rule here says what
the code does or must do; where the two disagree, one of them is a bug, and
the fix lands together with the page.

## Principles

- **A diary stays light.** Entities form a ladder of complexity (see
  `AGENTS.md`), and the interface follows it: what is cheap to write is cheap
  to look at. Fewer controls, no modes, nothing that nags.
- **One of each.** One select, one popup, one set of buttons, one scale of
  tokens. A new need grows the shared piece rather than adding a second one.
- **Phone and desktop at once.** Every screen is looked at 375 px wide and on a
  desktop, in the light and the dark theme, before it is done.
- **Quiet.** Status speaks in icons with hints; suggestions wait next to what
  they are about; words are kept for what is urgent.
- **Nothing in an instant.** Every change of state eases in.
- **The visitor's choices.** Theme, accent hue and font are set by the visitor
  in the gear of the header. Nothing hard-codes them.

## How the pages are arranged

As in mature design systems — Material, Carbon, the GOV.UK Design System —
from the general to the particular:

- **Foundations** are the values and habits everything is built from: tokens,
  layout, motion, interaction, how styles are written.
- **Components** are the shared pieces, one page each: what it is for, its
  rules, how it is built.
- **Patterns** are how pieces combine on a screen: an admin page, AI in the
  interface.

## How to read a page

A page opens with what its subject is and who it is for. **Rules** are
imperative and short: follow them. **Why** gives the owner's decisions behind
them, so that a case the rules do not foresee can still be decided. **How it
is checked** names the tests; where none exists, the check is a look in the
browser.

## How to change them

- A change to a shared component or to a rule updates its page in the same
  commit.
- Tokens — colours, shadows, radii, spacing, type sizes — and breakpoints
  change only with the owner's explicit permission, asked for first. That
  includes adding one.
- A new page follows the template below and is listed in the index.
- Paths in backticks are written from the repository root and must exist.
- English, in the voice of `docs/content-blocks.md`: one `#` title, a short
  introduction, `##` sections, prose wrapped at about 80 columns, no emojis.

`tests/docs/design-docs.test.ts` fails when a path in backticks does not
exist, when a link between pages is broken, or when a page is missing from the
index.

## Page template

```markdown
# Name

What it is and who it is for, in one to three paragraphs.

## When to use it

When to reach for it, and when to reach for something else.

## Rules

- Imperative and short.

## How it is built

The file, its props, a small example.

## Why

The owner's decisions behind the rules.

## How it is checked

The tests, or what is looked at in the browser.
```

Foundation and pattern pages keep the parts that apply to them.

## Index

Foundations:

- [Tokens](foundations/tokens.md) — colour roles, shadows, radii, the spacing
  scale and its `max-w-*` trap, type sizes, fonts.
- [Layout](foundations/layout.md) — the rem scale, `sm:` alone, container
  queries, the admin grid and opaque surfaces, one line on a phone.
- [Motion](foundations/motion.md) — a transition on every change of state,
  reduced motion, the self-animating `loading`.
- [Interaction](foundations/interaction.md) — `hocus:`, touch, hints and long
  presses, keyboard focus.
- [Styling code](foundations/styling-code.md) — Tailwind first, scoped CSS,
  `:deep()`, integration stylesheets, arbitrary values.

Components:

- [Select](components/select.md) — `FieldSelect`, the one select.
- [Buttons](components/buttons.md) — `Button`, `ModalHeaderButton`, ranks,
  square icon buttons, fixed heights.
- [Fields](components/fields.md) — `Field`, `FieldLabel`, `FieldHint`, the ✦
  at a label.
- [Modals](components/modals.md) — the slim header, the body, sticky footer,
  tabs, closing one step at a time.
- [File window](components/file-window.md) — a file and its panel: sections
  under small captions, facts, the file's description, places as chips, the
  editor's screens, a visitor's «Где ещё используется».
- [Icons](components/icons.md) — the sprite, adding an icon, fixed meanings.
- [Hints](components/hints.md) — which elements get a `data-title-popup`, how
  its text is laid out, and never the native `title`.
- [Popups](components/popups.md) — one popup for everything that opens by an
  anchor: its arrow and densities, the pressed anchor, sheets on phones, the
  z-index scale, hints, link cards and Editor.js's own menus.

Patterns:

- [Admin pages](patterns/admin-pages.md) — headers, dashboard boxes, lists and
  filters, empty states, suggesting in place, no mode switches.
- [AI in the UI](patterns/ai-in-the-ui.md) — where the ✦ goes, proposals at
  labels, nothing when AI is off.
