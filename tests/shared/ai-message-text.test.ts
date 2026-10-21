import { describe, expect, it } from 'vitest';
import {
  messageBody,
  messageContent,
  messageExternalLinkUrls,
  plainMarkdown,
  typedLines,
} from '../../shared/ai-message-text';

describe('a message of a session', () => {
  it('reads as a text of the archive, but holds no file', () => {
    const message = messageContent(
      [
        '## What I found',
        '',
        '- One [link](https://example.com/a)',
        '- A [project](thei:project/p-1)',
        '',
        '> A quote',
        '',
        '::media[A picture]{asset="a-1" layout="centered"}',
        '',
        '::link[A card]{url="https://example.com/b"}',
      ].join('\n'),
    );
    expect(message.blocks.map((block) => block.type)).toEqual([
      'header',
      'list',
      'quote',
      'externalLink',
    ]);
  });

  it('names the sites it points at, inline and as cards', () => {
    expect(
      messageExternalLinkUrls(
        'See [a](https://example.com/a).\n\n::link{url="https://example.com/b"}',
      ).sort(),
    ).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(messageExternalLinkUrls('')).toEqual([]);
  });
});

describe('a table in a message', () => {
  const lines = (...rows: string[]) => rows.join('\n');

  it('stands where it is said, between the words around it', () => {
    const body = messageBody(
      lines(
        'Trips this year:',
        '',
        '| Where | When | Days |',
        '| :--- | :---: | ---: |',
        '| **Rome** | May | 5 |',
        '| [Oslo](https://example.com/oslo) | June |',
        '',
        'That is all.',
      ),
    );
    expect(body.map((piece) => piece.kind)).toEqual(['text', 'table', 'text']);
    const table = body[1]!.kind === 'table' ? body[1]!.table : undefined;
    expect(table?.align).toEqual(['left', 'center', 'right']);
    expect(table?.rows[0]).toEqual(['Where', 'When', 'Days']);
    // Cells are inline markup; a short row is made whole.
    expect(table?.rows[1]![0]).toBe('<b>Rome</b>');
    expect(table?.rows[2]![0]).toContain('href="https://example.com/oslo"');
    expect(table?.rows[2]![2]).toBe('');
  });

  it('keeps its escaped bars and code, and is no table without its dashes', () => {
    const [piece] = messageBody(
      lines('| a \\| b | `x | y` |', '|---|---|', '| 1 | 2 |'),
    );
    expect(piece?.kind === 'table' && piece.table.rows[0]).toEqual([
      'a | b',
      // Texts have no code of their own: the marks stay, the bar is kept.
      '`x | y`',
    ]);
    expect(
      messageBody(lines('| not | a table |', '| just | bars |')).map(
        (one) => one.kind,
      ),
    ).toEqual(['text']);
    expect(
      messageBody(lines('```', '| a | b |', '|---|---|', '```')).map(
        (one) => one.kind,
      ),
    ).toEqual(['text']);
  });

  it('escapes what it shows, and names the sites its cells point at', () => {
    const [piece] = messageBody(lines('| <script>x</script> |', '|---|'));
    expect(piece?.kind === 'table' && piece.table.rows[0]![0]).not.toContain(
      '<script',
    );
    expect(
      messageExternalLinkUrls(
        lines('| Site |', '|---|', '| [a](https://example.com/a) |'),
      ),
    ).toEqual(['https://example.com/a']);
  });
});

describe('the words the owner typed', () => {
  it('keep a single break inside the paragraph and an empty line between two', () => {
    const typed = typedLines(
      'First line\nsecond line\n\n\n\nA new one\r\nand on  ',
    );
    expect(typed).toBe('First line\\\nsecond line\n\nA new one\\\nand on');
    const message = messageContent(typed);
    expect(message.blocks.map((block) => block.data.text)).toEqual([
      'First line<br>second line',
      'A new one<br>and on',
    ]);
  });

  it('leave a line that already ends in a break as it is', () => {
    expect(typedLines('a\\\nb')).toBe('a\\\nb');
    expect(typedLines('  just words  ')).toBe('just words');
    expect(typedLines('\n\n')).toBe('');
  });
});

describe('the plain words of a text', () => {
  const text = [
    '## Found *two*',
    'A [project](thei:project/p-1) and C# \\*notes\\*,',
    'one line\\',
    'and the next.',
    '',
    '- An item',
    '> A quote',
    '::media[A picture]{asset="a-1"}',
  ].join('\n');

  it('read on one line, a link by its words and every mark dropped', () => {
    expect(plainMarkdown(text)).toBe(
      'Found two A project and C# notes, one line and the next. An item A quote',
    );
  });

  it('keep their lines apart when asked', () => {
    expect(plainMarkdown(text, true)).toBe(
      'Found two\nA project and C# notes,\none line\nand the next.\nAn item\nA quote',
    );
  });
});
