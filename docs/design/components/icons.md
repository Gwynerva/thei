# Icons

Thei draws every icon from one sprite of its own, built from the SVG files in
`app/assets/icons/`. An icon is named by its file, sized by the font size
around it and coloured by the text colour, so it sits in a line of text and
follows a hover like the words beside it.

## When to use it

- Beside words that say the same, to be found at a glance.
- Alone on a square button or as a status mark, with the words in its
  `aria-label` and its hint.
- As the sign of a kind of entity, wherever one is named.

## Rules

- Draw icons only with `<Icon name="…">`: no copies of an icon inline, no icon
  fonts, no icon packages. An inline `<svg>` is for a drawing computed from
  data — the ring of a share link's remaining time, the outline of a card — or
  a mark that belongs to rendered content.
- Size an icon with the text utilities (`text-xl`, `text-3xl`), colour it with
  the text colours (`text-text-3`, `text-accent`). It is `1.25em` square and
  `currentColor`.
- An icon file holds no colour of its own: no fixed `fill` or `stroke`, so
  `currentColor` reaches every path. Every file in the folder is drawn that way.
- The `loading` icon animates itself; never spin it.
- An icon has one meaning across the site. Before adding one, look for the icon
  that already means it; before reusing one, check what it already means.

Icons with fixed meanings:

| Icon                                                            | Means                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `project`, `project-section`, `event`, `thought`, `page`, `tag` | The kinds of entity: a diary entry is `thought` (`shared/entity-icon.ts`).                                   |
| `relation-related`, `relation-depends`, `relation-affects`      | The three readings of a relation (`shared/relation-display.ts`).                                             |
| `sparkles`                                                      | AI: the ✦ of a form and of the admin bar, a proposal at a label, the AI page.                                |
| `ai-chat`                                                       | An AI session, and what it answered with nothing to propose: a speech bubble with the sparkle in it.         |
| `history`                                                       | The past: a text's drafts and versions, the undo of an applied AI action, the archive of sessions, "rewind". |
| `undo`                                                          | Bringing back from the archive: a session the owner archived, to be written in again.                        |
| `face-dead`                                                     | Nothing there: a search with no results, a session or a file that is gone.                                   |
| `done-all`                                                      | Accepting at once all that an AI is sure of: the sure parts of a text edit, in its card and on its review.   |
| `action-click`                                                  | A call to act: a project's action button, and what waits for the owner's decision in AI.                     |
| `save`                                                          | Saving a form: its Save on a phone, where the words give way to it; `check` there once all of it is saved.   |
| `loading`                                                       | Work in progress.                                                                                            |
| `missing`                                                       | Drawn in place of a name the sprite does not know.                                                           |

Things AI makes wear the sparkle in their own icon, so their nature reads at a
glance, and their buttons prefer that icon to a word.

## How it is built

- `app/components/Icon.vue` renders `<svg thei-icon>` with a `<use>` of the
  symbol. An unknown name draws `missing` and warns in the console.
- `modules/thei/icons.ts` reads `app/assets/icons/` at build time into the
  sprite `/icons.svg`, the `IconName` type of `#thei/icons` (so a wrong name
  fails the type check) and the symbols the server draws pictures with. In
  development it rebuilds on any change in the folder and reloads the page.
- `app/composables/icon-sprite.ts` copies the sprite into the page once the app
  is mounted, so an icon drawn later — the error page after the connection
  dropped — never needs the network.

To add an icon, drop `<name>.svg` into `app/assets/icons/`: one `<svg>` with a
`viewBox` and paths that leave their colour to `currentColor`. The file name is
the icon's name.

```vue
<Icon name="history" class="shrink-0 text-text-3" />
```

## Why

- One sprite keeps every icon cached once and drawable offline, and the same
  shapes serve the server's pictures, so a changed icon changes those too.
- The owner asked for the undo of an AI change to wear the `history` icon, and
  for AI's own products to carry the sparkle.

## How it is checked

`bun run typecheck` fails on a name with no file. Nothing checks a file's
colours; keep them out by hand.
