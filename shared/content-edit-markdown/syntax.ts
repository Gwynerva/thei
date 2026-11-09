import type { Literal, Parents, Root } from 'mdast';
import {
  directiveFromMarkdown,
  directiveToMarkdown,
  type TextDirective,
} from 'mdast-util-directive';
import { fromMarkdown } from 'mdast-util-from-markdown';
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from 'mdast-util-gfm-strikethrough';
import {
  gfmTaskListItemFromMarkdown,
  gfmTaskListItemToMarkdown,
} from 'mdast-util-gfm-task-list-item';
import {
  toMarkdown,
  type ConstructName,
  type Handle,
  type Info,
  type State,
  type Unsafe,
} from 'mdast-util-to-markdown';
import { directive } from 'micromark-extension-directive';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';

/**
 * The Markdown the editing dialect is read and written in: CommonMark with
 * directives, strikethrough and task list items — and nothing else, so a bare
 * address stays text, as the owner typed it.
 */
export function parseEditMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [directive(), gfmStrikethrough(), gfmTaskListItem()],
    mdastExtensions: [
      directiveFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmTaskListItemFromMarkdown(),
    ],
  });
}

/**
 * The constructs the label of a block's directive is written in: a caption,
 * a link's note.
 */
const LABEL: ConstructName[] = [
  'leafDirectiveLabel',
  'containerDirectiveLabel',
];

/** The constructs of any directive's label, a hint's words too. */
const ANY_LABEL: ConstructName[] = [...LABEL, 'textDirectiveLabel'];

/**
 * Characters the writer must escape beyond its own list.
 *
 * It escapes them in running text, but writes the label of a block's
 * directive as a construct of its own, where they would otherwise come back
 * as emphasis, code, markup, a character reference, a picture or a
 * directive: a caption with stars in it read back italic.
 *
 * A colon before a letter opens a directive. The writer escapes one only when
 * the character before it is not escaped itself, and takes the stars that
 * open a mark — `**:hint**` — for such a character, though they are not; so a
 * colon is escaped before a letter wherever it stands.
 */
const UNSAFE: Unsafe[] = [
  { character: '*', inConstruct: LABEL },
  { character: '_', inConstruct: LABEL },
  { character: '<', inConstruct: LABEL },
  { character: '`', inConstruct: LABEL },
  { character: '~', inConstruct: LABEL },
  { character: '&', after: '[#A-Za-z]', inConstruct: LABEL },
  { character: '!', after: '\\[', inConstruct: LABEL },
  { character: ':', after: '[A-Za-z]', inConstruct: ['phrasing', ...LABEL] },
];

const directives = directiveToMarkdown();
const writeDirective = directives.handlers!.textDirective as Handle & {
  peek?: Handle;
};

/**
 * A text directive — a hint — as the library writes it, but for its
 * attributes. The library escapes an ampersand and the quote there, yet keeps
 * a text directive's line breaks raw — where an empty line would end the
 * paragraph mid-directive — so they are written as character references,
 * which the reader decodes back. Inside the label of a directive — a hint in a
 * caption, or in another hint — a square bracket in its attributes would
 * close that label early and spill the rest of it, so there it is written as
 * a character reference too. The node itself is left as it was.
 */
function writeTextDirective(
  node: TextDirective,
  parent: Parents | undefined,
  state: State,
  info: Info,
): string {
  const written = writeDirective(node, parent, state, info);
  if (!node.attributes) return written;
  // The attributes come last: written alone, after the bare name, they are
  // the very end of what was written whole.
  const name = `:${node.name}`;
  const raw = writeDirective(
    { ...node, children: [] },
    parent,
    state,
    info,
  ).slice(name.length);
  if (!written.endsWith(raw)) return written;
  const inLabel = ANY_LABEL.some((label) => state.stack.includes(label));
  let safe = raw.replace(/\r\n|\r|\n/g, '&#10;');
  if (inLabel) safe = safe.replaceAll('[', '&#91;').replaceAll(']', '&#93;');
  return written.slice(0, written.length - raw.length) + safe;
}
writeTextDirective.peek = writeDirective.peek;

/** A mark written as its tag, `<b>` or `</b>`, where its stars would not do. */
export interface MarkTag extends Literal {
  type: 'markTag';
}

declare module 'mdast' {
  interface PhrasingContentMap {
    markTag: MarkTag;
  }
  interface RootContentMap {
    markTag: MarkTag;
  }
}

/**
 * A tag of a mark, written as it is. It is a node of its own rather than
 * `html`: the writer turns the line break before an `html` node into a space,
 * lest it start a block of HTML — which a mark's tag never does.
 */
function writeMarkTag(node: MarkTag): string {
  return node.value;
}
writeMarkTag.peek = () => '<';

/**
 * Editing Markdown from its tree. Whatever this writes, `parseEditMarkdown`
 * reads back as the words it was written from — every caption, title and
 * note with them; which marks it may write as stars is decided in
 * `inline.ts`.
 */
export function writeEditMarkdown(root: Root): string {
  return (
    toMarkdown(root, {
      extensions: [
        {
          ...directives,
          handlers: {
            ...directives.handlers,
            textDirective: writeTextDirective,
            markTag: writeMarkTag,
          },
        },
        gfmStrikethroughToMarkdown(),
        gfmTaskListItemToMarkdown(),
      ],
      unsafe: UNSAFE,
      bullet: '-',
      emphasis: '*',
      strong: '*',
      rule: '-',
      listItemIndent: 'one',
      resourceLink: true,
    })
      // A colon before letters could open a directive in running text, so
      // the writer escapes it everywhere — also in a link's address, where
      // nothing can open and `thei\:` only looks like a different scheme.
      .replace(/\]\(thei\\:/g, '](thei:')
      .trimEnd()
  );
}
