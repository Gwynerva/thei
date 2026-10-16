/**
 * The editing Markdown, explained to the model that reads and writes it.
 *
 * It describes exactly what `serialize.ts` writes and `parse.ts` reads; a
 * change to either belongs here in the same change.
 */
export const EDITING_MARKDOWN_REFERENCE = `\
# How texts are written

Every text (a diary entry's body, a project's description, a section, an event, a page, private notes) is read and written as Markdown with a few additions. It is the stored text, exactly as the owner typed it — not typeset.

Text:
- Paragraphs, \`## heading\` and \`### subheading\` (no other levels), \`**bold**\`, \`*italic*\`, \`~~strikethrough~~\`, a line break as a backslash at the end of a line.
- Lists: \`- item\`, \`1. item\` (a list may start at another number), \`- [ ] task\` / \`- [x] done\`; nest by indenting. A list keeps one kind at every level. A numbered list counted otherwise sits inside \`:::list{counter="lower-roman"}\` … \`:::\` — the counters are lower-roman, upper-roman, lower-alpha and upper-alpha.
- \`> quote\`. A quote with a caption or centred: \`:::quote[Caption]{align="center"}\` … \`:::\`.
- \`---\` between blocks: a divider.
- Links: \`[words](https://…)\`, a site path \`[words](/path)\`, or something on this site \`[words](thei:project/<id>)\`. The kinds are project, project-section, event, diary-entry, page and tag; a diary entry may be named by its day, \`thei:diary-entry/2026-10-14\`. A place inside the target goes after \`#\`. A link may carry the owner's note on why it is there as its title: \`[words](url "note")\`.
- \`:hint[words]{note="…"}\`: a note shown when hovering the words.

Blocks:
- \`::media[caption]{asset="a-…" layout="centered"}\` — a picture or a video; layout is centered, natural or stretch.
- \`:::gallery{title="…"}\` holding \`::media[caption]{#id asset="a-…"}\` lines, \`:::\` — pictures and videos shown together, under a title when it has one.
- \`::audio[caption]{asset="a-…" title="…"}\` — a recording; \`::file[caption]{asset="a-…" title="…"}\` — a file to download.
- \`:::files{title="…"}\` holding \`::file[caption]{#id asset="a-…" title="…"}\` lines, \`:::\` — files listed together under one title; a recording among them is played in place.
- A caption of any file may carry the same marks, links and hints as a paragraph; a title is plain words.
- \`::link[note]{url="https://…"}\` — a link shown as a card; \`::card[note]{to="thei:event/<id>"}\` — the same for something on this site.
- \`::embed{url="https://www.youtube.com/watch?v=…"}\` — an embedded video.
- \`:::private{#id}\` … \`:::\` — a part only the owner sees. \`:::spoiler\` … \`:::\` — blocks hidden under a blur until a reader opens them; they are not private. Where containers nest, the outer one uses more colons.

Files are referred to by their ids: the ones already in the text, or the files of the library brought into the session.

Never change typography: quotes, dashes, spaces and ellipses are set by the site when it shows the text.`;
