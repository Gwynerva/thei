import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { loadFilePreview } from '../../../app/composables/file-preview/open';
import { blobByteSource } from '../../../app/composables/file-preview/source';
import type { ByteSource } from '../../../shared/zip-directory';

const options = {};
const utf8 = (text: string) => new TextEncoder().encode(text);
const of = (bytes: Uint8Array | string) =>
  blobByteSource(new Blob([typeof bytes === 'string' ? utf8(bytes) : bytes]));

describe('file preview', () => {
  it('shows a text whole, and a large one from its start to a line end', async () => {
    expect(
      await loadFilePreview(
        { kind: 'text', extension: 'txt' },
        of('день 1'),
        options,
      ),
    ).toEqual({ view: 'text', text: 'день 1', shown: 10, total: 10 });
    const line = 'по Шуе от порога к порогу\n';
    const big = line.repeat(60_000);
    const view = await loadFilePreview(
      { kind: 'text', extension: 'txt' },
      of(big),
      options,
    );
    expect(view.view).toBe('text');
    if (view.view !== 'text') return;
    expect(view.shown).toBe(1024 * 1024);
    expect(view.total).toBe(utf8(big).length);
    expect(view.text.endsWith('порогу')).toBe(true);
  });

  it('reads Markdown, and a table by its delimiter', async () => {
    expect(
      await loadFilePreview(
        { kind: 'markdown', extension: 'md' },
        of('# Поход'),
        options,
      ),
    ).toEqual({ view: 'markdown', text: '# Поход' });
    expect(
      await loadFilePreview(
        { kind: 'table', extension: 'csv' },
        of('a;b\n1;2\n'),
        options,
      ),
    ).toEqual({
      view: 'table',
      rows: [
        ['a', 'b'],
        ['1', '2'],
      ],
      more: false,
    });
  });

  it('shows a table of one column as its lines', async () => {
    const view = await loadFilePreview(
      { kind: 'table', extension: 'csv' },
      of('one\ntwo\n'),
      options,
    );
    expect(view.view).toBe('text');
  });

  it('shows a file kept zipped as its original', async () => {
    const zipped = zipSync({ 'file.md': utf8('# Отчёт') });
    expect(
      await loadFilePreview(
        {
          kind: 'markdown',
          extension: 'md',
          archived: { extension: 'md', size: 13 },
        },
        of(zipped),
        options,
      ),
    ).toEqual({ view: 'markdown', text: '# Отчёт' });
  });

  it('looks at the bytes of a file of no known kind', async () => {
    expect(
      (
        await loadFilePreview(
          { kind: 'probe', extension: 'log' },
          of('plain words'),
          options,
        )
      ).view,
    ).toBe('text');
    expect(
      await loadFilePreview(
        { kind: 'probe', extension: 'log' },
        of(new Uint8Array([0x89, 0x50, 0, 0, 1, 2])),
        options,
      ),
    ).toEqual({ view: 'none' });
  });

  it('downloads a page too large to frame, and says plainly what failed', async () => {
    const huge: ByteSource = {
      size: 30 * 1024 * 1024,
      read: () => Promise.reject(new Error('nothing should be read')),
    };
    expect(
      await loadFilePreview({ kind: 'html', extension: 'html' }, huge, options),
    ).toEqual({
      view: 'error',
      reason: 'large',
    });
    expect(
      await loadFilePreview(
        { kind: 'zip', extension: 'zip' },
        of('no archive here'),
        options,
      ),
    ).toEqual({ view: 'error', reason: 'failed' });
  });

  it('settles a tie between delimiters by the kind of file', async () => {
    const line = ['id', 'name, x', 'note, y'].join('\t') + '\n';
    const tsv = await loadFilePreview(
      { kind: 'table', extension: 'tsv' },
      of(line),
      options,
    );
    expect(tsv).toMatchObject({ rows: [['id', 'name, x', 'note, y']] });
    const csv = await loadFilePreview(
      { kind: 'table', extension: 'csv' },
      of(line),
      options,
    );
    expect(csv).toMatchObject({
      rows: [['id\tname', ' x\tnote', ' y']],
    });
  });

  it('unpacks only the start of a long text kept zipped', async () => {
    const line = 'по Шуе от порога к порогу\n';
    const text = line.repeat(80_000);
    const zipped = zipSync({ 'file.txt': utf8(text) });
    const reads: number[] = [];
    const source = of(zipped);
    const counting: ByteSource = {
      size: source.size,
      read: (start, end) => (reads.push(end - start), source.read(start, end)),
    };
    const view = await loadFilePreview(
      {
        kind: 'text',
        extension: 'txt',
        archived: { extension: 'txt', size: utf8(text).length },
      },
      counting,
      options,
    );
    expect(view).toMatchObject({
      view: 'text',
      shown: 1024 * 1024,
      total: utf8(text).length,
    });
    // The packed text is far larger than what a start needs.
    expect(Math.max(...reads)).toBeLessThanOrEqual(1024 * 1024 + 65536);
  });

  it('refuses a page kept zipped that is too large before unpacking it', async () => {
    // Its size in the archive says so: nothing is unpacked to learn it.
    const zipped = zipSync({ 'file.html': new Uint8Array(21 * 1024 * 1024) });
    expect(
      await loadFilePreview(
        {
          kind: 'html',
          extension: 'html',
          archived: { extension: 'html', size: 30 * 1024 * 1024 },
        },
        of(zipped),
        options,
      ),
    ).toEqual({ view: 'error', reason: 'large' });
  });
});
