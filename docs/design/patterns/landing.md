# Landing

A link may lead to a place on its page rather than to the page as a whole: a
find of the search, a heading of the contents, the block of related
entities, a status or an avatar of the feed of a life, a file shown on
another page, a file's window sent by its address. However it came, it lands
the same way: the place is brought out of whatever hides it, into sight, and
lit. This page is about how that looks and behaves; the search's own side of
it is in [Search](search.md).

## The address of a place

The place is written into the address's hash (`shared/landing.ts`):

- `b-<block>`, `b-<block>~<file>` — a block of a text, a file shown in it;
- `showcase~<file>`, `files~<file>` — a file of the page's showcase or of its
  files;
- `statuses~<day>`, `avatars~<id>` — a status in the history of statuses, an
  avatar in the history of avatars;
- `r-<kind>~<address>` — a related entity, on the relations block, or
  what an excerpt is about, in the line over the title of its page;
- `l-<address>` — a link of the page;
- a part of the page: `icon`, `banner`, `showcase`, `files`, `links`,
  `tags`, `periods`, `facts`, `statuses`, `avatars`, `owner-notes`;
- `~open` after a file or an avatar — its window, open on it;
- anything else — an anchor, the id of an element: a heading of the text,
  `project-description`, `project-sections`, `related-entities`,
  `excerpts-about` (the block of excerpts about the entity), and
  `excerpt-<id>` with `excerpt-<id>--<heading>` for an excerpt shown on its
  parent's page and a heading inside it.

The words found follow as a text fragment, `:~:text=…`. A file is named by
its public id, never by the id it is stored under. A heading never takes a
name a page gives its own parts (`RESERVED_CONTENT_ANCHORS` in
`shared/content-headings.ts`), and an element whose id is the very hash is
what the hash means, unless it is a part of the page.

## Bringing it out

The page brings the place out of whatever hides it
(`app/composables/landing.ts`): it opens a spoiler, turns a gallery to the
file, shows a list cut short in full, opens the history of statuses or of
avatars and reads it on to the day or the avatar, turns the relations block
to the kind and its pages to the entity, shows «About me» and the facts in
full, opens the sidebar's sheet on a phone, and opens the hint, the link's
card or the file's window where the words are only there. Words in a line
cut short — a relation's note beside what it is about
(`PublicRelationInline.vue`) — are marked, and the hint that says the line
whole is opened too.

- A part of a page that hides what a find may lead to takes part: it marks
  its places (`data-block`, `data-file`, `data-relation-href`, `data-link`,
  `data-status-date`, `data-avatar`, `data-landing-zone`) and brings them in
  when asked (`useLandingReveal`, or the `theilanding` event sent from the
  place).
- A new hiding part — a slider, a tab, a «show more» — does the same in the
  same change.

## Into sight, and lit

- The place is lit by a layer laid over it, so a picture never hides it:
  tinted, ringed and glowing in the accent, two seconds as it is and four
  fading, every click going through it. The words are marked in it, and what
  it cuts short is read in full while the reader is there.
- The router looks for no element by the hash of a place
  (`app/router.options.ts`): another page opens at its top, and the landing
  brings the place into the middle of the window.
- An anchor is scrolled to by the router, as any link to an id is: it stands
  at the top, under the sticky header. The landing scrolls to it only when
  it was hidden — a heading under a spoiler — or when its id reads as a
  place, which the router leaves alone. It lights it either way.
- A link to the place already in the address — the same entry of the
  contents pressed again — lights it again.
- Going back or forth in the history lands nowhere: the page is put where it
  was, and nothing is lit.

## A file's window by its address

- A visitor's window of a file (see [File window](../components/file-window.md))
  has an address of its own while it is open: the page's, with the file
  named open where it stands — `#b-<block>~<file>~open` in a gallery of a
  text, `#showcase~<file>~open`, `#files~<file>~open`,
  `#avatars~<id>~open`. Stepping to another file changes it in place.
- The address can be sent. Opened, it lands on the place — the gallery
  turned to the file, the history read on to the avatar — and presses what
  the page opens the window with (`data-opens-viewer`), so the window opens
  with the same files to step through as a press would give.
- The address is then put back to the place without `~open`: once the
  window closes, Back or a reload leaves the page at the file rather than
  opening it again. Back closes the window in one step, as it closes any
  modal.
- A link opens only what the page shows its reader. Nothing is fetched by
  the id in the address: a file in a private part, a private file or a page
  the reader may not open is not on the page they get, and the address opens
  the page with no window and says nothing. A share link's grant is kept by
  the browser, not in the address, so an address sent on carries none of it.
- A preview of the address in a messenger is the page's card: the hash never
  reaches the server.

## How it is built

- `shared/landing.ts` writes a place (`landingHash`) and reads it back
  (`parseLandingHash`); `isLandingPlaceHash` tells the router which hashes
  are not ids.
- `app/composables/landing.ts`: `usePageLanding`, called by
  `app/layouts/public.vue`, lands on each address once; `useLandingReveal`
  and `useLandingSheet` are how the parts of a page take part.
- `useModalAddress` (`app/composables/modal.ts`) gives a modal its address,
  written into its entry of the history; `PublicAssetModal.vue` takes the
  places of its files from what opened it (`openPublicAssets`).
- The search writes its finds' places (`placeHref` in
  `server/thei/search/documents.ts`), the feed of a life those of statuses
  and avatars (`server/thei/public/life.ts`), and a file's window the place
  of the file on each page it lists (`server/thei/public/file-places.ts`).
- The light is `.landing-light` in `app/styles/content.css`, the words
  `::highlight(landing-words)`.

## Why

- A find that led to the top of a long page, or to a text under a spoiler,
  made the reader look for it again.

## How it is checked

- `tests/shared/landing.test.ts` writes and reads every kind of place;
  `tests/app/components/landing-marks.test.ts` keeps every part of a page
  a hash names marked, and the line of what an excerpt is about.
- `tests/app/modals/modal-stack.test.ts` keeps a modal's address in its entry
  of the history.
- `tests/server/public/file-places.test.ts` leads a file's places to where
  each page shows it; `tests/server/life-share.test.ts` a status to its day.
- `tests/e2e/landing.spec.ts` lands on a heading, a hidden heading and a
  window by its address, and checks that Back lights nothing;
  `tests/e2e/search.spec.ts` lands on a find in a spoiler.
- In the browser, at 1280 × 800 and 375 × 812, in both themes: a find in a
  spoiler, a gallery, a status and a sidebar; an entry of the contents; a
  window opened, stepped through and opened again by its address.
