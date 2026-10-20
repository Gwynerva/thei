import {
  collectContentExternalLinkUrls,
  normalizeContentData,
  type ContentOutputData,
} from './content';
import { escapeHtmlText } from './content-edit-markdown/html';
import { parseEditMarkdownToBlocks } from './content-edit-markdown/parse';
import { stripMarks } from './content-edit-markdown/patch-core';

/**
 * What is said in an AI session — the model's answers, the owner's messages:
 * editing Markdown, read as a text of the archive — headings, lists, quotes,
 * links to entities and to other sites, their cards — but holding no file. A
 * session is no place the library counts as using a file, so a picture, a
 * gallery, a recording or an attachment in it would outlive its file; they
 * are left out, as is a private edge, which means nothing in a message.
 */
const MESSAGE_BLOCKS = new Set([
  'paragraph',
  'header',
  'quote',
  'list',
  'delimiter',
  'externalLink',
  'integration',
  'entityLink',
]);

/**
 * Words the owner typed, as editing Markdown: a single line break stays a
 * break inside its paragraph — a backslash ends the line — and an empty line
 * between two starts a new one.
 */
export function typedLines(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/([^\n\\])\n(?!\n)/g, '$1\\\n');
}

/**
 * The words of editing Markdown, to show in a line or to compare: a link by
 * its words; its marks, escapes, the signs of its headings, lists and
 * quotes and the files placed in it dropped. On one line, or with `lines`
 * by its lines — a heading and the paragraph after it apart.
 */
export function plainMarkdown(markdown: string, lines = false): string {
  const text = stripMarks(markdown.replace(/\\(?=\n|[^\p{L}\p{N}\s])/gu, ''))
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*>]\s+/gm, '')
    .replace(/::\w+(\[[^\]]*\])?\{[^}]*\}/g, '');
  return (
    lines
      ? text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n')
      : text.replace(/\s+/g, ' ')
  ).trim();
}

/** Words of a message as a text, its diary days still named by day. */
export function messageContent(markdown: string): ContentOutputData {
  return normalizeContentData({
    blocks: parseEditMarkdownToBlocks(markdown).blocks.filter((block) =>
      MESSAGE_BLOCKS.has(block.type),
    ) as never,
  });
}

// ---- Tables -----------------------------------------------------------------

/**
 * A table said in a message, as Markdown writes one: a row of headings, a
 * row of dashes that may set each column's alignment, the rows under them.
 * The archive's texts hold no tables — a table is a way to answer, not
 * something kept — so it is read here, for a session alone. Each cell is
 * inline markup as a paragraph of a text holds it.
 */
export interface AiMessageTable {
  /** The heading row first. */
  rows: string[][];
  align: ('left' | 'center' | 'right' | null)[];
}

/** What a message says, in order: words as a text, and the tables among them. */
export type AiMessagePiece =
  | { kind: 'text'; content: ContentOutputData }
  | { kind: 'table'; table: AiMessageTable };

/** The cells of a row, or none for a line that is not one. */
function cellsOf(line: string): string[] | undefined {
  let text = line.trim();
  if (!text.includes('|')) return undefined;
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  let code = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === '\\' && text[index + 1] === '|') {
      cell += '|';
      index++;
      continue;
    }
    if (char === '`') code = !code;
    if (char === '|' && !code) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

const DASHES = /^:?-+:?$/;

function alignOf(dashes: string): AiMessageTable['align'][number] {
  const left = dashes.startsWith(':');
  const right = dashes.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
}

/** Text that needs no reading as markup: written out as it is. */
const PLAIN = /^[^*_`~[\]<>&\\!:]*$/;

/** A cell's markup as a paragraph holds it, made safe as one is. */
function cellHtml(markdown: string): string {
  if (!markdown) return '';
  if (PLAIN.test(markdown)) return escapeHtmlText(markdown);
  const block = parseEditMarkdownToBlocks(markdown).blocks.find(
    (item) => item.type === 'paragraph',
  );
  const text = block
    ? normalizeContentData({ blocks: [block] as never }).blocks[0]?.data.text
    : undefined;
  return typeof text === 'string' ? text : escapeHtmlText(markdown);
}

type Segment =
  { kind: 'text'; markdown: string } | { kind: 'table'; table: AiMessageTable };

/**
 * Markdown cut where its tables stand: a table starts with a row and a row
 * of dashes as many as its cells, and runs to the first line that is no row.
 * Code fenced off is never read as one.
 */
function splitTables(markdown: string): Segment[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const segments: Segment[] = [];
  let text: string[] = [];
  let fence: string | undefined;
  const flush = () => {
    if (text.join('').trim())
      segments.push({ kind: 'text', markdown: text.join('\n') });
    text = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const opened = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (opened && (!fence || opened.startsWith(fence)))
      fence = fence ? undefined : opened;
    const head = fence ? undefined : cellsOf(line);
    const dashes = head ? cellsOf(lines[index + 1] ?? '') : undefined;
    if (
      !head ||
      !dashes ||
      dashes.length !== head.length ||
      !dashes.every((cell) => DASHES.test(cell))
    ) {
      text.push(line);
      continue;
    }
    const rows = [head];
    let next = index + 2;
    for (; next < lines.length; next++) {
      const row = lines[next]!.trim() ? cellsOf(lines[next]!) : undefined;
      if (!row) break;
      rows.push(
        Array.from({ length: head.length }, (_, column) => row[column] ?? ''),
      );
    }
    flush();
    segments.push({
      kind: 'table',
      table: {
        rows: rows.map((row) => row.map(cellHtml)),
        align: dashes.map(alignOf),
      },
    });
    index = next - 1;
  }
  flush();
  return segments;
}

/**
 * A message as it is read: its words as a text — diary days still named by
 * day — and its tables where they stand.
 */
export function messageBody(markdown: string): AiMessagePiece[] {
  return splitTables(markdown).flatMap((segment): AiMessagePiece[] => {
    if (segment.kind === 'table') return [segment];
    const content = messageContent(segment.markdown);
    return content.blocks.length ? [{ kind: 'text', content }] : [];
  });
}

/**
 * The other sites a message points at: a session is one of the places a link
 * lives, so its site is read once and kept, and forgotten with the session.
 * A table's cells count as the paragraphs they are.
 */
export function messageExternalLinkUrls(markdown: string): string[] {
  if (!markdown.trim()) return [];
  try {
    return messageBody(markdown).flatMap((piece) =>
      collectContentExternalLinkUrls(
        piece.kind === 'text'
          ? piece.content
          : normalizeContentData({
              blocks: piece.table.rows
                .flat()
                .filter(Boolean)
                .map((text) => ({ type: 'paragraph', data: { text } })),
            }),
      ),
    );
  } catch {
    return [];
  }
}
