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
  "blocks": [{ "id": "abc", "type": "paragraph", "data": {} }]
}
```

`id` is optional. Unknown block types are rejected, not ignored.

## Inline markup

Text fields hold a deliberately small HTML subset, enforced by
`normalizeContentInlineHtml` in `shared/content-link.ts`:

- `<b>` / `<strong>`, `<i>` / `<em>`, `<br>`
- `<a href="…">` for an external address
- `<a data-content-link="entity" data-entity-type="project|event|page" data-entity-id="…">`
  for a link to something on this site

Everything else is stripped. A heading holds plain text only.

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
| `entityLink`             | `{ entityType: 'project' \| 'event' \| 'page', entityId }` — a card for something on this site                     |
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
