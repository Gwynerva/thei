# Content blocks

Every text in Thei — a project description, a project section, an event body,
a page, the "about me" — is one Editor.js document stored as JSON in the
`content` table. This is the list of blocks such a document can hold, exactly
as `normalizeBlockData` in `shared/content.ts` accepts them. Unsaved drafts and
recent versions of a text, kept in the `content-history` table, are documents
of exactly the same shape.

It exists so that a reader outside the editor — a model rewriting a text, a
script importing one, a person inspecting a backup — knows what a document can
say, without reading the tools. Nothing here describes what the editor's UI
looks like, only the stored shape.

**Keep it true.** Any change to a block type, its data, or the inline markup
belongs in this file in the same commit.

## The document

```json
{
  "version": "2.31.6",
  "time": 1750000000000,
  "blocks": [
    {
      "id": "abc",
      "type": "paragraph",
      "data": {},
      "tunes": { "spoiler": true }
    }
  ]
}
```

`id` is optional. Unknown block types are rejected, not ignored.

## Block attributes

`tunes` holds what is true of a block rather than what is in it. Only
attributes this release knows about survive, and only when they are set — an
absent `tunes` is the ordinary case.

| attribute | meaning                                                                    |
| --------- | -------------------------------------------------------------------------- |
| `spoiler` | `true` — the block is hidden under blur and dust until the reader opens it |

A spoiler is presentation, not access control: the text is in the document and
in the Markdown copy, and anyone can reveal it. Something a visitor must not
read belongs in a private section.

## Inline markup

Text fields hold a deliberately small HTML subset, enforced by
`normalizeContentInlineHtml` in `shared/content-link.ts`:

- `<b>` / `<strong>`, `<i>` / `<em>`, `<s>`, `<br>`
- `<a href="…" data-content-link="external">` for an external address; a
  relative `href` (`/…`) is kept as a plain `<a href="…">`
- `<a data-content-link="entity" data-entity-type="…" data-entity-id="…">`
  for a link to something on this site — see the entity types below
- `<abbr data-content-hint="…">` — a note attached to a span of text, shown on
  hover; a hint with an empty note is dropped and its text kept

Either kind of `<a>` may carry `data-content-note="…"`: the owner's words about
why the link is there, stored trimmed and ended as a caption (see "Endings"
below); an empty note is no attribute.
It never stands in for what the target says of itself: the target's own title
and description are shown, and the note under them, in the popup over the
link. A link block carries the same kind of note in its data (see below),
shown as the last line of its card. The sidebar of a public page lists only
what the owner attached by hand, never what the text links to.

An entity link names its target by kind and uuid, never by address, so it
survives the site moving to another domain. The kinds are those of
`CONTENT_ENTITY_TYPES` in `shared/content-link.ts`:

| `entityType`      | `entityId` is the  |
| ----------------- | ------------------ |
| `project`         | project's uuid     |
| `project-section` | section's uuid     |
| `event`           | event's uuid       |
| `diary-entry`     | diary entry's uuid |
| `page`            | page's uuid        |
| `tag`             | tag's uuid         |

A tag has no visibility of its own: a reader may open it once a public
project or event carries it, as its own page decides.

An entity link may lead to a place inside its target — a heading, a block of
the page, a passage of text: `data-entity-fragment="…"`, written between
`data-entity-id` and `data-content-note`, and an `entityLink` block's
`fragment`. It is the part of an address after `#`, without the `#`, kept
the way an address carries it (`normalizeLinkFragment`): nothing in it is
decoded, so `:~:text=…` and an encoded heading keep working, and what an
address cannot carry as it is — a space, a quote — is percent-encoded. An
empty one, or one longer than `CONTENT_LINK_FRAGMENT_LIMIT`, is no
attribute. The link opens its target's address with `#` and the fragment
appended; whether the target still has that place is not checked, and a
browser simply opens the page when it does not.

A heading's place is the anchor its page gives it (`contentHeadingAnchors`
in `shared/content-headings.ts`): the headings a stranger reads are numbered
first and the private ones after them, so the owner and a stranger read the
same anchors, and the fixed anchors of a page — `project-description`,
`project-sections`, `related-entities` — are never a heading's.

An address of this very site is never stored as an external link when the
editor can tell what it opens: pasted into an empty paragraph, pasted over
selected text or written in the link popup, it is stored as an entity link
instead, with the address's `#…` as its fragment.

A target the reader may not open arrives without its uuid:
`<a data-content-link="entity" data-entity-type="…" data-entity-restricted="true">`,
and an `entityLink` block as `{ entityType, restricted: true }`, and is shown
as closed; its fragment goes with the uuid. A target that no longer exists
keeps its uuid and is shown as a broken link: the resolver answers that it was
not found — the same answer a stranger gets when asking by uuid about a target
they may not open.

`<strike>` is accepted on the way in and stored as `<s>`, because that is what
the browser's own editing command still produces. Everything else is stripped,
and a heading holds plain text only — stored HTML-escaped, as a text field in
an HTML document is.

## Blocks

| `type`                   | `data`                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `paragraph`              | `{ text }` — inline HTML                                                                                           |
| `header`                 | `{ text, level: 2 \| 3 }` — plain text                                                                             |
| `quote`                  | `{ text, caption, alignment: 'left' \| 'center' }` — both inline HTML                                              |
| `list`                   | `{ style: 'unordered' \| 'ordered' \| 'checklist', items, meta }`; an item is `{ content, items, meta }` and nests |
| `delimiter`              | `{}`                                                                                                               |
| `contentMedia`           | `{ asset, layout: 'centered' \| 'natural' \| 'stretch', caption }`                                                 |
| `contentGallery`         | `{ title, items: [{ id, asset, caption }] }` — an item without an `id` is dropped                                  |
| `contentAudio`           | `{ asset, title, caption }` — an audio file, played in place                                                       |
| `contentAttachment`      | `{ asset, title, caption }` — any file, shown as a download                                                        |
| `contentFileGroup`       | `{ title, items: [{ id, asset, title, caption }] }` — files listed together, each shown as it would be alone       |
| `externalLink`           | `{ url, note? }` — rendered as a preview card                                                                      |
| `integration`            | `{ provider: 'youtube', videoId, … }`, see `shared/content-integrations.ts`                                        |
| `entityLink`             | `{ entityType, entityId, fragment?, note? }` — a card for something on this site; see inline markup                |
| `privateSectionBoundary` | `{ sectionId, edge: 'start' \| 'end' }`                                                                            |

The editor's link block is stored as what it was pointed at: an
`entityLink` for something on this site, an `integration` for an address a
block of its own takes (a video), and an `externalLink` for any other
address. One nothing was chosen for is not stored.

`asset` is `{ assetUuid }` when stored. What a reader receives is hydrated: the
asset carries its media descriptor and address, or is `null` when the reader
may not see it; a file of a list the reader may not see is left out of it. A
recording's asset also carries `audio: { duration, peaks, channels? }` — its
length in seconds and up to 128 loudness values from 0 to 100 — which is what
its player draws before it loads anything.

What each block holds is declared once, in `CONTENT_FILE_BLOCKS`
(`shared/content.ts`): `contentMedia` and `contentGallery` show pictures and
videos within the media limit, `contentAudio` recordings, `contentAttachment`
and `contentFileGroup` any file. In a group a recording is played in place and
any other file — a picture too — is shown as a file. A file's `caption`, in
every one of these blocks, is one line of inline HTML, as a paragraph's text
without line breaks; its `title`, and a gallery's or a group's, is plain
text. A `contentAudio` and a `contentAttachment` have the same data, so either
turns into the other as it is.

An item of a gallery or a group is named by its `id`, its own within the
list: an item without one is dropped, and one whose `id` an item before it
already has takes that `id` with the first free number after it — `f1-2` —
so an item copied is never the same item twice, and the same list always
comes out the same.

A link block's `note` is the owner's plain-text word on why the link is there,
like `data-content-note` inline: whitespace collapsed, ended as a caption, and
absent rather than empty, so a block without a note is stored exactly as
before notes existed.
What a site says of itself — its title, description and icon — is never stored
in the block. An `entityLink` whose target the reader may not open arrives
without its note.

An item's `content` is inline HTML, like a paragraph's `text`, so a line
broken inside an item is a `<br>`; in Markdown it goes on indented under the
item.

A list's `meta` is what the list tool keeps about the list as a whole: for an
ordered list `{ start, counterType }`, where `counterType` is one of
`numeric`, `lower-roman`, `upper-roman`, `lower-alpha`, `upper-alpha`. An
item's `meta` is `{ checked }` in a checklist. Both are kept as given.

## Endings

The last mark of a caption or a heading is settled where a block is
normalized (`shared/terminal-punctuation.ts`), never while it is typed:

- A caption — `contentMedia.caption`, a gallery item's `caption`,
  `quote.caption`, the `caption` of `contentAudio`, `contentAttachment` and a
  file of a `contentFileGroup`, a link block's `note` and
  `data-content-note` — ends without a full stop when it is one sentence, of
  any length, and with a mark when it has several: a full stop is added after
  a last sentence left open.
- A heading — `header.text`, the `title` of `contentAudio`,
  `contentAttachment`, a `contentGallery`, a `contentFileGroup` and each of
  its files — never ends with a full stop.
- Both keep `?`, `!`, `…` and `...` as typed, and the full stop that closes an
  abbreviation or an initial ("1990 г.", "и т. д.", "А. С."). Spaces before
  the last mark, a doubled full stop and a trailing comma or semicolon go.

In inline HTML only the characters of the visible ending are touched, inside
whatever tag holds them; an added full stop goes after the closing tags.
Everything else a block holds — a paragraph above all — stays as typed.

## Private sections

A private section is a pair of `privateSectionBoundary` blocks sharing a
`sectionId`: one `start`, one `end`. Everything between them is for the owner.

What a visitor receives never contains those blocks. In their place the public
document holds:

- `privateSectionPlaceholder` — a summary (`{ blockCount, wordCount, assetCount,
assetTotalSize }`) and nothing else;
- `privateSectionExpanded` — `{ summary, blocks }`, the same summary and the
  blocks themselves, only ever sent to the owner or to the holder of a live
  temporary access link for this very entity (a project's link covers its
  sections). Links inside it to other entities are still judged
  for the holder as a stranger.

## Text and Markdown

- `contentPlainText(data)` — everything as plain text. A link block's note is
  part of it, as a caption is; an inline link's note, an attribute, is not.
- `publicContentPlainText(data, 'all' | 'prose')` — the same, with private
  sections already gone; `prose` keeps paragraphs, headings, quotes and lists.
- `contentToMarkdown(data, options)` in `shared/content-markdown.ts` — the
  public document as Markdown, which is what `…/index.md` serves. A link's
  note, inline or on a block, is the link's title: `[text](url "note")`. An
  entity link's address, given to it before (`withEntityAddresses`), ends
  with its fragment: `[text](https://…/pages/cv/#skills)`. A
  recording is a link to its file followed by its length,
  `[title](url) (m:ss)`, named `options.audioLabel` when it has no title, and
  then its caption. A file's own description (`shared/asset-description.ts`),
  which the public content carries as `asset.alt` for a file shown publicly
  and never stores, is a picture's alt — `![description](url)`, its caption
  following as words of their own — and the title of an attachment's or a
  recording's link, `[title](url "description")`; without one a picture's
  alt is its caption's words, and the caption follows them only when it
  holds more than words — a link, a mark, a hint. A bracket in an alt, a
  file's title or a link's words is escaped, `\]`, so that it never closes
  the link. A group of files is its title on a line of its own,
  not a heading, and then a list: each file as it would be alone, its caption
  after it, `- [title](url) (m:ss) — caption`. A gallery is its title the
  same way, then its pictures. With `options.format` the owner's words —
  text, captions, group and gallery titles,
  attachment and recording titles, hints, link notes, entity link titles,
  file descriptions —
  get the typography of the site's
  language, as on the page; markup, addresses, file names and the titles of
  other sites stay as they are. None of it is stored: the content keeps what
  was typed.
- `contentToEditMarkdown(data)` in `shared/content-edit-markdown/serialize.ts`
  — the stored document as editing Markdown, which is how an AI client reads
  a text over MCP and writes one back (see "Editing Markdown" below).

## Editing Markdown

The public Markdown copy leaves things out and typesets the rest. Editing
Markdown is the other kind: everything a document holds, exactly as stored,
in a form a model reads and writes well. Whatever it writes reads back into
the same blocks. `shared/content-edit-markdown/reference.ts` explains it to the
model; it changes with this table.

It is CommonMark with directives, strikethrough and task list items, and
nothing else: a bare address stays text.

| Stored                          | Editing Markdown                                                   |
| ------------------------------- | ------------------------------------------------------------------ |
| `paragraph`                     | a paragraph; a `<br>` is a backslash at the end of a line          |
| `header` level 2 / 3            | `## text` / `### text`                                             |
| `quote`, no caption, left       | `> text`                                                           |
| `quote` with caption or centred | `:::quote[caption]{align="center"}` … `:::`                        |
| `list`                          | `-`, `1.` (from `meta.start`), `- [ ]` / `- [x]`; nested by indent |
| `list` with another counter     | the list inside `:::list{counter="lower-roman"}` … `:::`           |
| `delimiter`                     | `---`                                                              |
| `contentMedia`                  | `::media[caption]{asset="a-…" layout="centered"}`                  |
| `contentGallery`                | `:::gallery{title="…"}` with `::media[caption]{#id asset="a-…"}`   |
| `contentAudio`                  | `::audio[caption]{asset="a-…" title="…"}`                          |
| `contentAttachment`             | `::file[caption]{asset="a-…" title="…"}`                           |
| `contentFileGroup`              | `:::files{title="…"}` with a `::file` line per file (below)        |
| `externalLink`                  | `::link[note]{url="…"}`                                            |
| `entityLink`                    | `::card[note]{to="thei:<kind>/<id>#fragment"}`                     |
| `integration`                   | `::embed{url="…"}`, the provider's canonical address               |
| a private section               | `:::private{#sectionId}` … `:::` around its blocks                 |
| `tunes.spoiler`                 | consecutive spoiler blocks inside `:::spoiler` … `:::`             |

A file of a group is `::file[caption]{#id asset="a-…" title="…"}`, whatever
its kind; `::audio` is read there too. Every file's caption takes the inline
markup below; a title is plain words.

Inline: `**bold**`, `*italic*`, `~~strikethrough~~`, `[text](https://… "note")`
for an external link, `[text](/path)` for a relative one,
`[text](thei:<kind>/<id>#fragment "note")` for an entity link, and
`:hint[text]{note="…"}` for a hint. A diary entry may also be named by its day
on the way in, `thei:diary-entry/2026-10-14`: the server turns the day into the
entry's uuid, and it is always written back by uuid. A `thei:` address that
names no kind and id keeps only its words, and the reader is warned. Where
containers nest, the outer one takes more colons. A line break at either end of
a text is left out: Markdown cannot write one there, and it breaks nothing a
reader sees.

Whatever the words of a text hold is escaped where Markdown would read it as
syntax — in a caption and a note between a directive's brackets too, and a
bracket in a hint's note inside them is written `&#91;` / `&#93;`. Two of the
same mark side by side are one: `<b>a</b><b>b</b>` is written `**ab**` and
read back `<b>ab</b>`, which a merge takes for the block it was, keeping it
as stored. Where the stars or tildes of a text's marks would run together or
not read as marks at all — a bold "Note:" right before italic words, a struck
word in quotes right after a letter, an emoji beside a mark — every mark of
that text is written as its tag,
`<b>…</b>`, `<i>…</i>`, `<s>…</s>`, which reads back as it is.
