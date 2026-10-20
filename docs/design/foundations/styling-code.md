# Styling code

How the look of a component is written: in Tailwind utilities first, in scoped
CSS where utilities cannot say it, and in a dedicated stylesheet only for a
third-party library whose DOM lives outside the component. The tokens these
read are on [Tokens](tokens.md).

## Rules

- Style Vue templates with Tailwind CSS 4 utilities. That is the default for
  everything.
- Write a custom class only where utilities cannot reasonably say it: a complex
  mask or animation, a native pseudo-element, computed geometry, a third-party
  DOM.
- Component-local custom CSS goes in `<style scoped>`. No CSS Modules, no
  unscoped `<style>` in a component, no `useCssModule`, no `$style`.
- Override a library inside the component with `:deep()` while its DOM stays
  inside the component.
- A global override that cannot be avoided — for UI a library teleports or
  appends to the body — goes in a dedicated integration stylesheet, scoped under
  the library's own root or a body state. `app/styles/editor.css` is the one
  for Editor.js, under `.content-editor` and
  `body.content-editor-modal-open`.
- Read design values from the tokens of `app/styles/main.css`. Do not invent a
  colour, a shadow, a radius or a spacing when a token or a standard utility
  fits; scoped CSS reads the same variables (`var(--color-accent)`,
  `var(--spacing-sm)`).
- Keep arbitrary Tailwind values to a minimum: only where no token or standard
  utility is right — a calculation over CSS variables, an intrinsic or
  container-relative size. `h-[calc(var(--spacing-xs)*2+1.5em+4px)]`, the
  height of a field, is one.
- Numeric utilities (`w-16`, `max-w-75`, `size-6`) are fine for one-off
  geometry.
- Check a named utility before using it: `max-w-sm` is a spacing token in Thei,
  not a container width (see [Tokens](tokens.md)).
- Shared utilities and variants live in `app/styles/main.css` (`@utility`,
  `@custom-variant`); the styles of stored content, `.content-prose` and its
  blocks, in `app/styles/content.css`.

## How it is built

`app/components/GridPattern.vue` is the shape of a justified custom class: one
scoped rule for what no utility expresses, everything else in the template.

```vue
<template>
  <div class="grid-pattern"></div>
</template>

<style scoped>
.grid-pattern {
  /* The embedded SVG mask has no equivalent Tailwind utility. */
  mask-image: url('data:image/svg+xml,…');
}
</style>
```

Three traps of scoped CSS:

- `:global(.a) .b` compiles to `.a` alone: everything after `:global()` is
  dropped, and the rule styles the ancestor. No `:global` is needed to key an
  element off an ancestor — scoped CSS marks only the last compound — so write
  `.group:is(:hover, :focus-visible) .b`, as `app/components/MediaEdge.vue`
  does, or use `group` and `group-hocus:` in the template.
- A component whose root is a `<Transition>` (`TransitionFade`) loses the
  parent's class when rendered on the server. Set `inheritAttrs: false` and
  bind `$attrs` to the element inside the transition, as
  `app/components/admin/AdminAiSessions.vue` does.
- A parent's `:deep(.b)` and the child's own scoped `.b` weigh the same, one
  class and one attribute each, so the stylesheet loaded last wins. In a
  production build that order depends on the page a visit began on: the
  server inlines the page's styles and leaves a stylesheet linked only while
  some of its components did not render, and the client links the others
  after it, an order a client navigation keeps. Write a component's defaults
  that a parent may override in `:where()`, as `.media-backdrop` in
  `app/components/MediaSurface.vue` is: Vue scopes inside it, the rule weighs
  nothing, and it still beats the utilities, which sit in a layer.
  `bun run dev` inlines nothing and never shows it.

## Why

- Utilities keep a component's look next to its markup, and the tokens behind
  them keep two components alike.
- An unscoped rule in a component leaks into every page that ever mounts it;
  an integration stylesheet keeps the leaks of a library in one file, under one
  root.

## How it is checked

Nothing checks styling code automatically; it is read in review against this
page. `bun run format` only orders the utilities, with
`prettier-plugin-tailwindcss` reading `app/styles/main.css`.
