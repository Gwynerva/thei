# File library

The stored files as one run through time, the same in the picker that reuses
a file and on the storage page: `app/components/AssetLibraryFeed.vue`. Files
stand in their places — a diary entry, an event, a section, a page — and the
places stand by their days, the newest first, under a heading per month.

## When to use it

- Wherever stored files are looked through or picked again: the picker a
  form opens with «Reuse» (`app/modals/asset-library/AssetLibraryModal.vue`)
  and the storage page (`app/pages/admin/assets/index.vue`), where the run
  lies in an opaque `Box` so the admin's grid never shows through it.

## How it is built

- **The day of a place** (`AssetLibraryPlace`, `shared/asset-library.ts`): a
  diary entry's own day, the first day of an event, of a section, or of a
  project's first dated section — an undated section takes its project's —
  and an excerpt its parent's. A file nothing holds stands at the day it was
  uploaded (`assets.createdAt`). A page, a tag and the profile have no day and
  come last, under «No date». The server orders by it
  (`listLibraryFeed`, `server/thei/assets/library.ts`), so diary entries come
  in the calendar's order whichever way the run goes.
- **The run** loads 60 placements at a time as it is scrolled, both ways
  (`ASSET_LIBRARY_FEED_PAGE`); there is no «Show more». A file in two places
  stands in both, and in one place once, though an upload between two pages
  moves the run (`app/composables/asset-library-feed.ts`). Within a month its
  places follow one another, the files nothing holds once for each day of
  upload, each named in a small line — its kind's icon, its name, its parent,
  its day where the name does not say it — over a grid of its files. Days are
  the reader's own: the feed asks with the reader's offset from UTC.
- **One bar sticks over the run**, right against whatever sticks above it —
  the picker's header, the page's header — with no gap, and as wide as
  what the run lies in: the picker's whole window, the storage page's box
  (`bleed`), its words kept in line with the files: the month in view on
  the left, once its heading has gone under the bar, and the years of the run
  on the right in the smallest type, scrolling sideways in a thin bar when
  they do not fit. The year in view is marked and kept in the middle of its
  strip as far as the strip allows; a click on a year starts the run at that
  year's first place, and what lies before it loads above without moving what
  is in view.
- **Above the run**, while nothing is typed: «Here and related» — the files of
  the entity whose form opened the picker and of every entity related to it
  (`libraryHereOf`, `app/composables/asset-library-here.ts`) — and «Used
  lately», the twelve files touched last. Both are grids that wrap; nothing
  scrolls sideways.
- **The search row** is `app/components/AssetLibrarySearch.vue`: the field,
  the kind of file, where it is used, and the order — a square with the
  `sort` icon, turned upside down for the oldest first. A kind the selection
  can never take is not offered. On a phone the field takes its own line.
- **Words read as filters** (`shared/asset-library-search.ts`): a day in any
  writing, a word for a day near today (the day of upload), a kind of file
  («видео», «jpg»), an extension kept as uploaded («pdf»), a kind of place
  («дневник»). They show under the row as chips, and taking one off removes
  its words. Each is its filter or its own words — a file whose caption says
  «вчера» is still found by «вчера» — so reading a search never hides what
  its words alone would find. The words are listed whole in the language
  packs (`libraryWords`), never matched by their stem.
- **What does not fit** the selection by its kind is not listed at all; a
  file too large still is, with its warning, since a smaller variant can be
  made of it.
- **A tile** (`app/components/AssetLibraryFeedTile.vue`, over `AssetTile`) is
  ringed in a neutral 2 px under the pointer or the keyboard; chosen, the ring
  turns to the accent and glows all round, and a check stands in its middle —
  white on a darkened, see-through accent, in either theme. The arrows walk
  the tiles as they lie, Space opens the file's window.
- **A file waiting to be swept** is ringed in red with a bin on the storage
  page, where it is about to go; in the picker, where taking it is what keeps
  it, it is drawn as any other and only its hint says so.
- **In the picker a click takes the file as it is**: at once when one file is
  picked, into the footer when several are. A round button at the top of the
  tile, shown only under the pointer and on keyboard focus, opens the editor
  for any other way — a new variant, a crop. Under a finger, which has no
  pointer to show the button under, a long press on the tile opens it; such
  a tile gives up its hint there, the line of its place saying where it is. A file too large to take as it
  is goes to the editor on a click.
- **The picker's footer**, when several files are taken: the chosen files on
  the left, a click letting one go — under the pointer a ✕ covers the one
  it is over, under a finger a small ✕ sits in each one's corner, so that
  none reads as the square ✕ beside them — scrolling sideways in a thin bar
  when they are many; on the right a square ✕ that lets them all go, «Clear
  selection» in its hint, and «Insert · N» in the accent. The header holds the
  title and the close alone.

## How it is checked

- `tests/server/assets/library.test.ts`: the order of places by their days
  either way, diary entries in the calendar's order, a jump to a year, files
  nothing holds at their upload day, what is here and what was used lately,
  and that a word read as a filter never hides a file whose own words it is.
- `tests/e2e/asset-library.spec.ts`: picking one file and several, by a click
  and through the editor, a tap and a long press by touch, the day read as
  a chip, the storage page keeping its
  search in the address.
