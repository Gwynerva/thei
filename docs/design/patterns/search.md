# Search

The site has one search, for a visitor and the owner alike: one popup, one
key, one page. What it finds depends on who looks — a visitor finds what the
pages show a stranger, the owner finds everything, the closed with its lock,
and is offered a few things to do. How the index is built and read is set
out in the Search section of `AGENTS.md`; this page is about how search looks
and behaves.

## Opening it

- On a public page the search icon of the header opens the quick search. It
  stays a link to `/search/`, so a click that asks for a new tab or window
  goes there; the popup takes the plain click (`openSearch` in
  `app/components/public/PublicHeader.vue`).
- In the admin, which has no header of the site, the admin bar has a search
  button. On a public page the admin bar has none: two search buttons on one
  screen would be two searches.
- Ctrl+K (⌘K on a Mac) and "/" open it anywhere, through
  `useSiteSearchKeys` (`app/composables/site-search.ts`): Ctrl+K by its
  physical key, so it works on any layout, in a field too; "/" only where it
  types nothing. Neither does anything while a modal is in front. Ctrl+K
  again, with the search open, selects the query.
- On the search page itself the keys and the icon take the page's own field
  instead of opening a second search over it.

## The quick search

`app/components/search/SearchPopup.vue`, a `FloatingPopup` marked
`complex`: by its anchor on a desktop, a sheet on a phone.

- Results come as the query is typed (`useQuickSearch`), the best three of
  each kind, under grey group names with no icons: the icon of the kind is in
  each row already.
- One row per result (`SearchQuickRow.vue`): the kind's icon in the title's
  line, then its time quiet after it; under it, from the left edge, the place
  found best and its words, the found ones marked, and a faint `+N` for the
  other places; the picture of the result dissolving in from the right, or a
  file's own preview, framed.
- ↑ ↓ choose, Enter opens, Ctrl+Enter shows everything on the search page,
  Esc closes and gives the focus back. The foot says so, on a desktop only.
- Enter opens where the owner is: the page on the site, the editor in the
  admin; Shift+Enter the other one.
- The owner, with nothing typed, is offered the day's diary entry, the other
  side of the page they are on, and what they saved last; with a query, the
  diary of a day the query names and a section of the admin by its name come
  first, and a new project, event or page named by the query, and ✦ with AI
  on, come last. Nothing that cannot be undone, nothing rare: those stay in
  their forms.

## The search page

`app/pages/search/index.vue`.

- Without a query it is the catalogue of projects and events, with its
  presets (`/projects/`, `/events/`, `/showcase/`, `/cv/`) and its filters.
- With one, what was found across the site, grouped by kind, the best three
  of each and «All N» to the rest; chips above count and choose the kinds,
  each with the faint icon of its kind; the years and tags the results fall
  in beside, in the sheet «Filters» on a phone.
- The field stands right under the header, with the page's usual small gaps
  on a phone.
- Typing keeps what was found on screen until the new answer comes; a
  failure says so in the line of the count and keeps the old results.

## The result card

`app/components/search/SearchResultCard.vue`, one for every kind.

- A head like the site's other cards: the kind and its time, the title, the
  description, with the result's picture dissolving in from the right
  (`MediaEdge`), or a file's own preview, framed. The owner sees its lock,
  its badges and a pencil to its editor.
- Under the head, the full width of the card, the places the words were
  found at — a section, a caption, a file's description, a hint, a note —
  each with the icon of what it is, its words, and a small preview for a find
  in a file. A line between every part.
- The places the head already shows, its title and description, are not
  listed again.

## Landing where it was found

A find leads to its place on the page, written into the address's hash
(`shared/search/landing.ts`), and the page brings it out of whatever hides it
(`app/composables/search-landing.ts`): it opens a spoiler, turns a gallery to
the file, shows a list cut short in full, opens the history of statuses and
reads it on to the day, turns the relations block to the kind and its pages
to the entity, shows «About me» and the facts in full, opens the sidebar's
sheet on a phone, and opens the hint, the link's card or the file's window
where the words are only there. The place is lit for a moment, the words are
marked in it, and what it cuts short is read in full while the reader is
there.

- A part of a page that hides what a find may lead to takes part: it marks
  its places (`data-block`, `data-file`, `data-relation-href`, `data-link`,
  `data-status-date`, `data-landing-zone`) and brings them in when asked
  (`useLandingReveal`, or the `theilanding` event sent from the place).
- A new hiding part — a slider, a tab, a «show more» — does the same in the
  same change.

## Why

- Two searches on one screen confused the owner; a stranger and the owner
  now meet one popup, which only holds more for the owner.
- The kind's icon is on every result, so a group's name needs none.
- A find that led to the top of a long page, or to a text under a spoiler,
  made the reader look for it again.

## How it is checked

- `tests/shared/search/landing.test.ts` writes and reads every kind of place.
- `tests/app/composables/shortcut.test.ts` presses the keys on other layouts.
- In the browser, at 1280 × 800 and 375 × 812, in both themes: the popup,
  the page, and a find in a spoiler, a gallery, a status and a sidebar.
