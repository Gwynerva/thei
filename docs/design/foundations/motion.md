# Motion

No state of a control or a surface changes in an instant in Thei. A colour, a
border, a shadow or an opacity that changes on hover, focus, press or
selection eases into its new value, at one duration and one easing for the
whole site. This page says how, and what is allowed to skip it.

## Rules

- A change of background, text or icon colour, border, outline, shadow or
  opacity — on hover, focus, press, a selected row, a chosen option — goes
  through Tailwind's `transition` or `transition-colors`.
- Keep Tailwind's default duration and easing, which are Thei's: 150ms and
  `cubic-bezier(0.4, 0, 0.2, 1)`. Do not set `duration-*` or `ease-*` on an
  ordinary state change.
- Scoped CSS uses the same pair through `var(--default-transition-duration)`
  and `var(--default-transition-timing-function)`.
- What appears or disappears fades: `app/components/TransitionFade.vue`. A
  popup also grows from its arrow as it opens and back into it as it closes,
  and a sheet slides up from the bottom ([Popups](../components/popups.md)).
  A modal fades in over what it covers and stays whole until the next one is
  in ([Modals](../components/modals.md)); the same pair of duration and
  easing, read by `app/modals/layer-motion.ts`.
- A wait shows its `loading` icon only once a transition's length has passed
  (`app/modals/ModalWaiting.vue`): what comes quickly never flashes it.
- Something that leaves room behind gives it up as it goes, as "Reuse" does
  to "Upload" in the file picker, rather than leaving a hole that closes at
  once.
- What comes with the page is rendered with it, on the server. Only what shows
  up later — a box that appears when its first item does — fades in; nothing
  pops in after the page has drawn.
- Only what must follow the pointer or a drag goes without a transition, and so
  does everything under `prefers-reduced-motion`: `motion-reduce:duration-0` or
  `motion-reduce:transition-none` in a template, a
  `@media (prefers-reduced-motion: reduce)` block in scoped CSS.
- The `loading` icon animates itself (`app/assets/icons/loading.svg` carries
  its own keyframes). Never spin it with `animate-spin` or a rotation.

## How it is built

```vue
<button
  class="rounded-normal bg-bg-3 text-text-2 transition-colors
    hocus:bg-bg-4 hocus:text-text-1"
></button>
```

```css
.part {
  transition: opacity var(--default-transition-duration)
    var(--default-transition-timing-function);
}
```

A few motions are part of one component and keep their own timing: the
indeterminate progress bar (`animate-indeterminate`), the height of an aside
panel (`aside-content-panel`) and the scrollbar that fades in on hover
(`scrollbar-hover`), all in `app/styles/main.css`. They are not values to
reach for elsewhere.

## Why

- A state that flips in an instant reads as a flicker, and two durations side
  by side read as two sites.
- A box that pops in after the page has drawn moves what the reader was
  looking at; the dashboard's AI box was moved to render with the page for
  this.

## How it is checked

By eye in the browser; no test reads durations. Where a flicker would be a
bug — a save control flashing from "Saved" to "Save" and back — e2e specs
record every state the control shows, as `tests/e2e/editor-undo.spec.ts` and
`tests/e2e/external-link-notes.spec.ts` do.
