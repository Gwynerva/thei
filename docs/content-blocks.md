# Content blocks

Every text in Thei — a project description, a stage, a section, an event body,
a page, the "about me" — is one Editor.js document stored as JSON in the
`content` table. This is the list of blocks such a document can hold, exactly
as `normalizeBlockData` in `shared/content.ts` accepts them.

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

| attribute | meaning                                                            |
| --------- | ------------------------------------------------------------------ |
| `spoiler` | `true` — the block is blurred over until the reader asks to see it |

A spoiler is presentation, not access control: the text is in the document and
in the Markdown copy, and anyone can reveal it. Something a visitor must not
read belongs in a private section.

## Inline markup

Text fields hold a deliberately small HTML subset, enforced by
`normalizeContentInlineHtml` in `shared/content-link.ts`:

- `<b>` / `<strong>`, `<i>` / `<em>`, `<s>`, `<br>`
- `<a href="…">` for an external address
- `<a data-content-link="entity" data-entity-type="…" data-entity-id="…">`
  for a link to something on this site — see the entity types below
- `<abbr data-content-hint="…">` — a note attached to a span of text, shown on
  hover; a hint with an empty note is dropped and its text kept

Either kind of `<a>` may carry `data-content-note="…"`: the owner's words about
why the link is there. The sidebar shows that note in place of the target's own
title, unless the same link was also attached by hand — a title written on
purpose wins.

An entity link names its target by kind and uuid, never by address, so it
survives the site moving to another domain. The kinds are those of
`CONTENT_ENTITY_TYPES` in `shared/content-link.ts`:

| `entityType`      | `entityId` is the  |
| ----------------- | ------------------ |
| `project`         | project's uuid     |
| `project-stage`   | stage's uuid       |
| `project-section` | section's uuid     |
| `event`           | event's uuid       |
| `diary-entry`     | diary entry's uuid |
| `page`            | page's uuid        |

An address of this very site is never stored as an external link when the
editor can tell what it opens: pasted into an empty paragraph or typed as an
external link, it is stored as an entity link instead.

A target the reader may not open arrives without its uuid:
`<a data-content-link="entity" data-entity-type="…" data-entity-restricted="true">`,
and an `entityLink` block as `{ entityType, restricted: true }`, and is shown
as closed. A target that no longer exists keeps its uuid and is shown as a
broken link: the resolver answers that it was not found — the same answer a
stranger gets when asking by uuid about a target they may not open.

`<strike>` is accepted on the way in and stored as `<s>`, because that is what
the browser's own editing command still produces. Everything else is stripped,
and a heading holds plain text only.

## Blocks

| `type`                   | `data`                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `paragraph`              | `{ text }` — inline HTML                                                                                           |
| `header`                 | `{ text, level: 2 \| 3 }` — plain text                                                                             |
| `quote`                  | `{ text, caption, alignment: 'left' \| 'center' }`                                                                 |
| `list`                   | `{ style: 'unordered' \| 'ordered' \| 'checklist', items, meta }`; an item is `{ content, items, meta }` and nests |
| `delimiter`              | `{}`                                                                                                               |
| `contentMedia`           | `{ asset, layout: 'centered' \| 'natural' \| 'stretch', caption }`                                                 |
| `contentGallery`         | `{ items: [{ asset, caption }] }`                                                                                  |
| `contentAttachment`      | `{ asset, title, caption }` — any file, shown as a download                                                        |
| `externalLink`           | `{ url }` — rendered as a preview card                                                                             |
| `integration`            | `{ provider: 'youtube', videoId, … }`, see `shared/content-integrations.ts`                                        |
| `entityLink`             | `{ entityType, entityId }` — a card for something on this site; the types are listed under inline markup           |
| `privateSectionBoundary` | `{ sectionId, edge: 'start' \| 'end' }`                                                                            |

`asset` is `{ assetUuid }` when stored. What a reader receives is hydrated: the
asset carries its media descriptor and address, or is `null` when the reader
may not see it.

## Private sections

A private section is a pair of `privateSectionBoundary` blocks sharing a
`sectionId`: one `start`, one `end`. Everything between them is for the owner.

What a visitor receives never contains those blocks. In their place the public
document holds:

- `privateSectionPlaceholder` — `{ blockCount, … }`, a count and nothing else;
- `privateSectionExpanded` — `{ blocks }`, only ever sent to the owner.

## Text and Markdown

- `contentPlainText(data)` — everything as plain text.
- `publicContentPlainText(data, 'all' | 'prose')` — the same, with private
  sections already gone; `prose` keeps paragraphs, headings, quotes and lists.
- `contentToMarkdown(data, options)` in `shared/content-markdown.ts` — the
  public document as Markdown, which is what `…/index.md` serves.
