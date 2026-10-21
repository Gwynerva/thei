# Layout

How Thei fits a page to a screen: the scale everything is measured in, the one
breakpoint, container queries for components that live in rooms of different
sizes, the background of the admin and the surfaces on it, and how much a line
may hold on a phone.

Every screen is built for a phone and a desktop at once, and looked at on both
— 375 px wide and 1280 px — in the light and the dark theme before it is done.

## The rem scale

The root font size is 0.9rem below the `sm` breakpoint and 1rem from it on
(`:root` in `app/styles/main.css`). Everything measured in rem — Tailwind's
numeric utilities, the named spacing, type — tightens together on a phone.

- Prefer the rem-based numeric utilities (`w-16`, `max-w-75`, `size-6`) to
  pixel values, so that a size shrinks with the rest.
- Do not name every one-off size. When the same value keeps coming back for the
  same purpose, reuse a token, or ask the owner before adding one.

## Breakpoints

- `sm:` and `max-sm:` (Tailwind's 40rem) are the one responsive convention.
- `app/styles/main.css` also defines `xs` (24rem). Only the admin bar uses it,
  as `max-xs:`, to fit its buttons on the narrowest phones.
- Using any other breakpoint — `xs` included, `md:`, `lg:` — adding one, or
  writing a media query on width needs the owner's permission first.
- Media queries on what a device can do are not breakpoints and stay where they
  are: `(hover: hover)`, `(pointer: coarse)`, `pointer-coarse:`,
  `prefers-reduced-motion`.

## Container queries

A component that sits both across a page and in a narrow card or column answers
to the room it is given, not to the screen. Mark its container with `@container`
and write the size inline, as `app/components/external-links/ExternalLinkPreviewCard.vue`
does with `@max-[24rem]:`. This needs no permission. Where the screen is what
matters, keep to `sm:`.

## Page width

A page's content is `m-auto` and `w-(--width-wide)` or `w-(--width-narrow)`,
with `px-window` at its sides, as the dashboard is:

```html
<div class="m-auto flex w-(--width-wide) flex-col px-window py-lg"></div>
```

Card grids use `grid-cols-cards` with `gap-md`: two to a row while each card
gets 24rem, one below that.

## The admin background and its surfaces

The admin lies on a grid: `app/components/admin/AdminGridWrapper.vue` lays
`app/components/GridPattern.vue` under every admin page (`app/layouts/admin.vue`)
and under the sign-in, install, update and OAuth pages.

- Anything that is a surface — a pane, a card, a box, a field — is opaque:
  `bg-bg-1`, `bg-bg-2`, `bg-bg-3` or `bg-bg-4`. The grid never shows through
  it.
- A disabled surface stays opaque. Fade what is inside it instead, as the
  select does with `group-disabled:opacity-55` on its words and icons.
- The glass of the admin bar (`bg-bg-1/60 backdrop-blur-md`) and of sticky
  headers (`app/components/GlassSurface.vue`, the header of a modal) is the one
  deliberate exception.

## One line on a phone

- On a phone a line holds a title and one or two controls. Nothing more.
- Meta — a date, a source, an owner, a cost — goes under the title or into the
  scrolling body. Secondary actions go to the bottom action area or a menu.
- Label and value pairs stack on a phone; nothing is squeezed into narrow
  columns side by side.
- Sticky headers and footers stay one slim row: on a phone they eat the view.
  A sticky header's title is `text-lg` on a phone and `text-xl` from `sm:`,
  and its Save is a square with a floppy disk (see [Buttons](../components/buttons.md)).
- A word that does not fit gives way to its icon, as the tabs of
  `app/components/UnderlineTabs.vue` and a `collapsible` select do, still named
  in full for a screen reader and in a hint.

## Shared utilities

`app/styles/main.css` keeps the few layout utilities that recur:

- `grid-cols-cards` for card grids;
- `tr-normal`, `tr-section`, `th`, `p-td` and `p-td-tight` for tables;
- `scrollbar-mini`, `scrollbar-hover` and `scrollbar-clear` for boxes that
  scroll inside a surface;
- `text-halo-*` for words over a picture's fading edge, `mask-ease` for that
  fade itself.

## Why

- The owner rejected screens whose header took half a phone, and rows crammed
  with back, icon, name, meta and buttons: a template editor's header and the
  action catalog were rebuilt for it.
- The grid is the admin's ground; a translucent surface on it reads as a
  mistake, and a faded disabled one lets the grid through.

## How it is checked

- The e2e specs check every popup at 1280×800 and 375×812 with
  `expectPopupUsable` (`tests/e2e/helpers/popup.ts`).
- Everything else is looked at in the browser at both widths and in both
  themes before the work is called done.
