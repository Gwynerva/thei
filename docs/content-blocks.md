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
why the link is there, stored as typed, trimmed; an empty note is no attribute.
It never stands in for what the target says of itself: the target's own title
and description are shown, and the note under them — in the popup over the
link and in the sidebar. A link block carries the same kind of note in its
data (see below), shown as the last line of its card. When the same address is attached by hand too, the sidebar
lists it once if only one of them has a note or both say the same, and twice
if they say different things.

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

An address of this very site is never stored as an external link when the
editor can tell what it opens: pasted into an empty paragraph, pasted over
selected text or typed as an external link, it is stored as an entity link
instead.

A target the reader may not open arrives without its uuid:
`<a data-content-link="entity" data-entity-type="…" data-entity-restricted="true">`,
and an `entityLink` block as `{ entityType, restricted: true }`, and is shown
as closed. A target that no longer exists keeps its uuid and is shown as a
broken link: the resolver answers that it was not found — the same answer a
stranger gets when asking by uuid about a target they may not open.

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
| `contentGallery`         | `{ items: [{ id, asset, caption }] }` — an item without an `id` is dropped                                         |
| `contentAttachment`      | `{ asset, title, caption }` — any file, shown as a download                                                        |
| `externalLink`           | `{ url, note? }` — rendered as a preview card                                                                      |
| `integration`            | `{ provider: 'youtube', videoId, … }`, see `shared/content-integrations.ts`                                        |
| `entityLink`             | `{ entityType, entityId, note? }` — a card for something on this site; the types are listed under inline markup    |
| `privateSectionBoundary` | `{ sectionId, edge: 'start' \| 'end' }`                                                                            |

`asset` is `{ assetUuid }` when stored. What a reader receives is hydrated: the
asset carries its media descriptor and address, or is `null` when the reader
may not see it.

A link block's `note` is the owner's plain-text word on why the link is there,
like `data-content-note` inline: whitespace collapsed, and absent rather than
empty, so a block without a note is stored exactly as before notes existed.
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
  note, inline or on a block, is the link's title: `[text](url "note")`. With
  `options.format` the owner's words — text, captions, attachment titles,
  hints, link notes, entity link titles — get the typography of the site's
  language, as on the page; markup, addresses, file names and the titles of
  other sites stay as they are. None of it is stored: the content keeps what
  was typed.
