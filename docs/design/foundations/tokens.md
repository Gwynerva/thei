# Tokens

Every colour, shadow, radius, spacing step and type size of Thei comes from a
small set of tokens declared in the `@theme` block of `app/styles/main.css`.
Tailwind turns each into utilities — `--color-bg-2` into `bg-bg-2`,
`text-bg-2`, `border-bg-2`; `--spacing-md` into `gap-md`, `p-md` — and scoped
CSS reads the same variables. This page says what each token is for, so that
the right one is picked rather than the nearest-looking one.

**Ask first.** Adding, removing or changing a token — a colour, a shadow, a
radius, a spacing step, a type size, a breakpoint — needs the owner's explicit
permission. Using the existing ones needs none.

## Colours

`--color-*: initial` wipes Tailwind's own palette: `bg-red-500` or `text-gray-400`
do not exist in Thei. The colours below are all there is.

Each colour is written once with `light-dark()`, so one token serves both
themes. The theme is the visitor's choice in the gear of the header (`system`,
`light` or `dark`, `app/scripts/visuals.ts`), which sets `data-theme` and
`color-scheme` on the root. `dark:` keys off `data-theme`, not off the
system's preference; with tokens it is rarely needed.

| Colour (`--color-*`)                           | What it is for                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bg-1`                                         | The page itself, and what is set into a surface: a field, a select's trigger, an inset row.          |
| `bg-2`                                         | Surfaces on the page: a box, a modal, a popup.                                                       |
| `bg-3`                                         | A step up inside a surface: a secondary button, a badge, a table head, the option under the pointer. |
| `bg-4`                                         | One more step: a neutral header button under the pointer.                                            |
| `bg-document`                                  | The ground of a file shown as it is — a text, a table, a document — faintly tinted with the accent.  |
| `border-1`                                     | The border of a surface or a field at rest, and dividing lines.                                      |
| `border-2`                                     | A stronger border, such as the dashed edge of an empty state.                                        |
| `border-3`                                     | A field or a select under the pointer, in focus or open.                                             |
| `text-1`                                       | Text that is read.                                                                                   |
| `text-2`                                       | Secondary text: hints under a field, meta, the words of quiet controls.                              |
| `text-3`                                       | The faintest: placeholders, disabled words, icons that only decorate.                                |
| `accent`                                       | The visitor's accent: the main button, what is chosen, a narrowed filter, every mark of AI.          |
| `bg-accent`                                    | A pale ground tinted with the accent: a chosen option card, the ground of an accent icon.            |
| `text-error`, `bg-error`, `border-error`       | Errors, a delete under the pointer.                                                                  |
| `text-warning`, `bg-warning`, `border-warning` | Warnings, and what is new.                                                                           |
| `text-success`, `bg-success`, `border-success` | Success.                                                                                             |
| `bw`, `bw-reverse`                             | White in the light theme and black in the dark, and the other way round; a hint is drawn in them.    |
| `white`, `black`                               | The same in both themes, such as the words on an accent button.                                      |
| `shadow-1`, `shadow-2`, `shadow-3`             | Colours for shadows, see below.                                                                      |

The accent is the visitor's too. Its hue, `--hue-accent`, is one of eighteen
picked in the gear (a random one on a first visit); its lightness and chroma
are set per theme in `:root[data-theme]`, with `--lightness-accent-dark` and
`--chroma-accent-dark` for places that stay dark in either theme. Every grey —
the grounds, the borders, the text — is tinted with the same hue. Never write a
fixed hue or a colour of your own: on another visitor's screen it is wrong.

Opacity modifiers of these tokens are part of the system and widely used:
`bg-accent/80` with `hocus:bg-accent` for the main button, `bg-bg-3/40` for a
disabled secondary one, `bg-bg-1/70` for glass.

## Shadows

A shadow of a surface on the page is one of Tailwind's sizes coloured with a
shadow token, which is tinted with the accent and grows lighter in the dark
theme. What floats over the page has a shadow of its own, `shadow-popup` and
`shadow-hint`: layered, so it reads as lifted well off the page, and dark in
both themes, as a shadow is. In the dark theme a popup's lighter surface and a
hairline of light along its top edge do the rest of the lift.

| Where                       | Utilities                                      |
| --------------------------- | ---------------------------------------------- |
| A box on a page (`Box.vue`) | `shadow-md shadow-shadow-1`                    |
| A modal                     | `shadow-xl shadow-shadow-2`                    |
| A popup                     | `shadow-popup`, drawn by `FloatingPopup`       |
| A hint                      | `shadow-hint`, drawn by `TitlePopup`           |
| A sticky header once stuck  | `shadow-lg` and `sticky-stuck:shadow-shadow-1` |

A new surface takes the shadow of its kind from this table. Tailwind's default
shadow colour is a black the dark theme does not lighten; only a few small
marks, such as a badge's `shadow-sm`, keep it.

## Radii

- `rounded-normal` (Tailwind's `--radius-lg`, 0.5rem) is the radius of every
  surface, field and button.
- `rounded-full` is for round things: an overlay button, a chip, a badge, a
  count, a toggle.
- `rounded-sm` is for parts inside a surface: the options of a select, its
  filter field.

## Spacing

Tailwind's base step, `--spacing`, is 0.25rem, and its numeric utilities
(`gap-2`, `w-16`, `max-w-75`) are used for one-off geometry. Five named steps
sit beside it for the gaps and paddings that recur everywhere:

| Token | Value           | About   |
| ----- | --------------- | ------- |
| `xs`  | 0.45 × `md`     | 0.62rem |
| `sm`  | 0.75 × `md`     | 1.03rem |
| `md`  | 5.5 × `spacing` | 1.38rem |
| `lg`  | 2 × `md`        | 2.75rem |
| `xl`  | 2 × `lg`        | 5.5rem  |

`--spacing-window` (`px-window`) is the room between content and the edge of
the window: `sm` on a phone, `md` from the `sm` breakpoint on.

**The `max-w-*` trap.** Tailwind 4 resolves `max-w-sm`, `w-md`, `max-w-lg`
and the like from the spacing tokens of the same name before its container
sizes. In Thei `max-w-sm` is about 1rem, not 24rem. For a width, use a numeric
utility (`max-w-96`, `max-w-140`) or a width token (`w-(--width-wide)`). The
responsive prefix `sm:` is unrelated and safe.

Two widths and a height are kept as variables in `app/styles/main.css`:
`--width-narrow` (700px at most), `--width-wide` (1100px at most) and
`--height-admin-bar`.

## Type

Sizes are Tailwind's, `text-xs` to `text-6xl`, plus one of Thei's own:
`text-2xs` (0.6875rem), for meta lines under a title, a count in a badge and
the small capitals of a group's heading. Nothing else: no arbitrary
`text-[0.7rem]`. The owner allowed a few new sizes; the audit needed only this
one.

A field's label is `font-semibold tracking-tight`, and so is a modal's title;
the heading of a box or a page is `font-bold`; long text keeps the default
weight.

## Fonts

Thei serves its own fonts, Noto Sans and Noto Serif as variable fonts from the
`@fontsource-variable` packages (`css` in `nuxt.config.ts`). The visitor picks
sans or serif in the gear; the choice lands in `--font-default`, which the root
uses, so text follows it without a class. Use `font-sans` or `font-serif` only
where a text must keep its face whatever the visitor chose, and `font-mono`
for code and keys.

## Why

- The tokens are few so that two screens built months apart still look like
  one site, and so that a visitor's theme, hue and font reach every corner.
- `text-2xs` was the single size the owner agreed to add after an audit of
  arbitrary sizes; "not too many" was the condition.

## How it is checked

- `tests/app/styles/hocus-variant.test.ts` compiles the custom variants of
  `app/styles/main.css` with Tailwind.
- The tokens themselves are reviewed by eye, in both themes, on a phone and on
  a desktop.
