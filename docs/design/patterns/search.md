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
  each kind, under grey group names in capitals with no icons, as on the
  search page: the icon of the kind is in each row already.
- One row per result (`SearchQuickRow.vue`): the kind's icon in the title's
  line, then its time quiet after it — on a phone its years only, where the
  days have no room; a section's project, quieter still, after its own
  small rounded icon, gives way before the title does. Each quiet part
  follows a dot: «Сияние · ▣ Териберка · 2026». Under it, from the left edge, the place found best and its
  words, the found ones marked, two lines on a phone that stop short of the
  picture; then, on a line of its own under an arrow from the result, in
  italics, how many other places hold the words — a bare «+5» on the
  picture's fading edge was all but unseen. The result's picture dissolves
  in from the right, or a file's own preview stands there, framed.
- A clamped line shows whatever its padding holds, so the find's two lines
  on a phone have no room for the text halo: they keep off the picture
  instead.
- The row Enter takes is ringed as a picker's row is (`useActiveRow`): the
  first, until the arrows or the pointer choose another, so what was typed
  always shows where Enter goes. Queries searched for before, offered with
  nothing typed, wait for the keys instead.
- ↑ ↓ choose, Tab and Shift+Tab go from group to group — past the last,
  Tab goes on to the history's bin, or to «All results» at the foot — Enter
  opens, Ctrl+Enter shows everything on the search page, Esc closes and gives
  the focus back. None of it is told on screen: the foot holds how many were
  found, always a link to all of them.
- The owner's way to the editor is «✎ Изменить» on the row's last line,
  after «↳ Ещё в N местах», a target of its own apart from the row's link.
  The two are alike and the faintest of the row, semibold, the accent and
  underlined under the pointer. In the find's line above them, where it was
  found is as faint, and its words a tone brighter — never as bright as the
  title.
- The row Enter takes has its ring, following the keys and the pointer as a
  select's option does; it fades in from clear with the row's shade, never
  from the text's colour.
- What to do with the query that leads — the day's diary, a part of the
  admin, ✦ for a question — stands first, over what the search says of its
  answer («Все слова вместе…»), a line away from what was found.
- Enter opens where the owner is: the page on the site, the editor in the
  admin; Shift+Enter the other one.
- The owner, with nothing typed, is offered the day's diary entry, the other
  side of the page they are on, and what they saved last; with a query, the
  diary of a day the query names and a section of the admin by its name come
  first, and a new event, project or page named by the query — the smaller
  first — and ✦ with AI on, come last. A question puts ✦ first and makes
  nothing; a day makes nothing either. Nothing that cannot be undone, nothing
  rare: those stay in their forms.
- Nothing typed, everyone is offered what they searched for before, under
  «Вы искали»: a row for each of the last twelve queries, newest first, with
  the history icon, cut short with an ellipsis and read whole in its hint. A
  visitor sees nothing else; the owner sees it last, after «Недавние».
  `SearchPopup.vue` rings these rows only once Tab, ↓ or the pointer goes to
  them, so Enter in an empty field does nothing; chosen, a query is put back in the field and
  searched for again there. The bin at the right of the heading forgets them
  all.
- A query is remembered once the reader goes somewhere with it — a result
  opened, «All results», a find's other places, a query searched for again,
  Enter on the search page or a result opened there — as the search read it,
  on the other keyboard if it was typed there; never at a pause in typing.
  The same query twice is kept once, last typed (`useSearchHistory`,
  `app/composables/search-history.ts`).
- It is kept in this browser alone, one list for the owner and one for a
  visitor, so a visitor never sees what the owner searched for; signing out
  forgets the owner's. A visitor with nothing typed asks the server nothing.
- With no history, a visitor reads one line of what the search finds. A
  query that found nothing says so, «Ничего не нашлось», and nothing more,
  here and on the page. What it says stays while an answer is on its way, so
  the popup never shrinks to an empty strip.

## The search page

`app/pages/search/index.vue`.

- Without a query it is the catalogue of projects and events, with its
  presets (`/projects/`, `/events/`, `/showcase/`, `/cv/`) and its filters.
- With one, what was found across the site, grouped by kind, the best three
  of each and «All N» to the rest; chips above count and choose the kinds,
  each with the faint icon of its kind; the years and tags the results fall
  in beside, in the sheet «Filters» on a phone.
- A phone shows what holds the results as chips above them — a year, a tag,
  the showcase — each undone with a touch; the sheet of filters is not
  offered when there is nothing to filter by. The kinds' chips are smaller
  there, so they take two rows rather than four.
- What was found can be read by its days, newest or oldest first, beside
  the best first: «Сортировка», a `FieldSelect` at the head of the filters,
  offered whenever more than one result was found. Chosen, it counts as a
  filter and shows among the chips on a phone. Every kind but the profile has
  days: the diary, events, sections and projects those of a life — newest by
  where a period ends, never past today, oldest by where it begins — and
  before what has only the day it was made; a page goes by when it was
  added, a file by the days of the place that shows it, a tag by the days of
  what carries it. The years keep to the days of a life alone.
- Read by days, a card with no days of its own says the one it stands at:
  «Добавлено …», a file's place's day, a tag's «Последний раз …».
- The years are a chart and a choice at once: one row a year, newest first,
  its count as a horizontal bar against the busiest year and as a number;
  the year chosen in the accent, the others dimmed, chosen again to show
  them all. Each facet counts within the other's choice: the chips in the
  year chosen, the years in the kind chosen.
- The field stands right under the header, with the page's usual small gaps
  on a phone.
- Typing keeps what was found on screen until the new answer comes; a
  failure says so in the line of the count and keeps the old results.

## What is found first

- A result named exactly as typed comes first, and its kind first among the
  groups: «где я была» is the page of that name before the projects that
  say the words — but for a section, a part, which stands after a whole
  named in full. Then a kind the query names («фото маяка»), then kinds whose
  best result holds every word in its name; within a kind, a name holding
  the words comes before a text that only says them.
- A query of words that only hold a sentence together — «где я была» — is
  read as a phrase, or every text with an «я» would answer.
- A file is found where it is shown: in a text, in a page's showcase or
  files, as an entity's icon or banner — where it leads to the page's hero,
  lit. An icon's description finds the file, not its entity a second time.
  One no page shows yet, found by the owner alone, leads to the library.
- A phrase holds its words in their order: what holds them apart is neither
  shown nor counted.
- A name a text spells in Latin letters is found in Cyrillic ones too:
  «евы» finds «EVA», «блендер» finds «Blender».
- A section of a project is a result of its own, under «Project sections»
  right after the projects: its title, description, periods and text are
  found in it, and it names its project. The project keeps only its
  sections' titles, which lead to them.
- When the words are not all found together, the results that hold some of
  them come, those holding more first, under a line that says so above them;
  a query typed on the other keyboard is said the same way.

## The result card

`app/components/search/SearchResultCard.vue`, one for every kind.

- A head like the site's other cards: the kind and its time, the title, the
  description, with the result's picture dissolving in from the right
  (`MediaEdge`), or a file's own preview, framed. A section names its
  project beside its kind, with the project's own icon (`EntityTokenIcon`),
  a link of its own. A file with neither title nor
  description is called by its kind and where it is shown. The words found
  are marked in the title and the description too.
- The owner sees its lock with two words beside it («Только вам»), its
  badges, and a pencil to its editor in the head's corner, on a ground of
  its own: in the line of badges it wrapped onto a line alone on a phone and
  sank into the picture. It stays faint until the card is pointed at.
- Under the head, the full width of the card, the places the words were
  found at — a section, a caption, a file's description, a hint, a note —
  each with the icon of what it is, its words, and a small preview for a find
  in a file. A line between every part.
- The places the head already shows, its title and description, are not
  listed again.
- «In N more places» opens the rest under them (`/api/search/finds`, read as
  the search read the query, for the same reader) and folds them away again.
  The quick search's line of the same words leads to the search page with
  that card open and brought into view (`?open=<ref>`).
- A search says how many it found on its chips; only the catalogue keeps its
  line of counts. Group names are capitals, larger than the cards' kind.

## Landing where it was found

A find leads to its place on the page, written into the address's hash
(`shared/search/landing.ts`), and the page brings it out of whatever hides it
(`app/composables/search-landing.ts`): it opens a spoiler, turns a gallery to
the file, shows a list cut short in full, opens the history of statuses and
reads it on to the day, turns the relations block to the kind and its pages
to the entity, shows «About me» and the facts in full, opens the sidebar's
sheet on a phone, and opens the hint, the link's card or the file's window
where the words are only there. The place is lit by a layer laid over it,
so a picture never hides it: tinted, ringed and glowing in the accent, two
seconds as it is and four fading, every click going through it. The words
are marked in it, and what it cuts short is read in full while the reader is
there. The router looks for no element by such a hash (`app/router.options.ts`):
another page opens at its top, and the landing brings the place into view.

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
- `tests/app/composables/search-history.test.ts` keeps, orders and forgets
  queries, the owner's apart; `tests/e2e/search.spec.ts` searches again from
  the history by its keys and clears it.
- `tests/app/composables/search-ui.test.ts` formats a find's words across
  its marks.
- In the browser, at 1280 × 800 and 375 × 812, in both themes: the popup,
  the page, and a find in a spoiler, a gallery, a status and a sidebar.
