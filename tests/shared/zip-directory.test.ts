import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  readZipDirectory,
  zipEntryBaseName,
  ZipReadError,
  zipTree,
  type ByteSource,
} from '../../shared/zip-directory';

const utf8 = (text: string) => new TextEncoder().encode(text);

/** A source that counts what is read, as a browser would ask for it. */
function bytesSource(bytes: Uint8Array) {
  const reads: [number, number][] = [];
  const source: ByteSource = {
    size: bytes.length,
    async read(start, end) {
      reads.push([start, end]);
      return bytes.slice(start, end) as Uint8Array<ArrayBuffer>;
    },
  };
  return { source, reads };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * An archive of stored files written by hand: names in any bytes and flags,
 * and, when asked, every size and offset in ZIP64 records.
 */
function handmadeZip(
  entries: { name: Uint8Array; data: Uint8Array; flags?: number }[],
  { zip64 = false } = {},
): Uint8Array {
  const files: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const local = new Uint8Array(30 + entry.name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, entry.flags ?? 0, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, entry.name.length, true);
    local.set(entry.name, 30);
    files.push(local, entry.data);

    const extra = zip64 ? 28 : 0;
    const record = new Uint8Array(46 + entry.name.length + extra);
    const cv = new DataView(record.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 45, true);
    cv.setUint16(6, 45, true);
    cv.setUint16(8, entry.flags ?? 0, true);
    cv.setUint32(20, zip64 ? 0xffffffff : entry.data.length, true);
    cv.setUint32(24, zip64 ? 0xffffffff : entry.data.length, true);
    cv.setUint16(28, entry.name.length, true);
    cv.setUint16(30, extra, true);
    cv.setUint32(42, zip64 ? 0xffffffff : offset, true);
    record.set(entry.name, 46);
    if (zip64) {
      const x = 46 + entry.name.length;
      cv.setUint16(x, 1, true);
      cv.setUint16(x + 2, 24, true);
      cv.setBigUint64(x + 4, BigInt(entry.data.length), true);
      cv.setBigUint64(x + 12, BigInt(entry.data.length), true);
      cv.setBigUint64(x + 20, BigInt(offset), true);
    }
    central.push(record);
    offset += local.length + entry.data.length;
  }
  const directoryOffset = offset;
  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const tail: Uint8Array[] = [];
  if (zip64) {
    const record = new Uint8Array(56);
    const rv = new DataView(record.buffer);
    rv.setUint32(0, 0x06064b50, true);
    rv.setBigUint64(4, 44n, true);
    rv.setBigUint64(24, BigInt(entries.length), true);
    rv.setBigUint64(32, BigInt(entries.length), true);
    rv.setBigUint64(40, BigInt(directorySize), true);
    rv.setBigUint64(48, BigInt(directoryOffset), true);
    const locator = new Uint8Array(20);
    const locatorView = new DataView(locator.buffer);
    locatorView.setUint32(0, 0x07064b50, true);
    locatorView.setBigUint64(8, BigInt(directoryOffset + directorySize), true);
    locatorView.setUint32(16, 1, true);
    tail.push(record, locator);
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, zip64 ? 0xffff : entries.length, true);
  ev.setUint16(10, zip64 ? 0xffff : entries.length, true);
  ev.setUint32(12, zip64 ? 0xffffffff : directorySize, true);
  ev.setUint32(16, zip64 ? 0xffffffff : directoryOffset, true);
  return concat([...files, ...central, ...tail, end]);
}

describe('zip directory', () => {
  it('lists an archive from its end, in two small reads', async () => {
    const archive = zipSync({
      'report/index.html': [utf8('<h1>Отчёт</h1>'), { level: 0 }],
      'report/data/rows.csv': utf8('a;b\n1;2\n'.repeat(200)),
      'Заметки.txt': utf8('Поход'),
      'report/empty/': new Uint8Array(0),
    });
    const { source, reads } = bytesSource(archive);
    const { entries, count } = await readZipDirectory(source);
    expect(count).toBe(4);
    expect(reads).toHaveLength(2);
    expect(entries.map((entry) => entry.name).sort()).toEqual([
      'report/data/rows.csv',
      'report/empty/',
      'report/index.html',
      'Заметки.txt',
    ]);
    const rows = entries.find((entry) => entry.name.endsWith('rows.csv'))!;
    expect(rows).toMatchObject({ method: 8, size: 1600, encrypted: false });
    expect(rows.packedSize).toBeLessThan(rows.size);
    expect(
      entries.find((entry) => entry.name === 'report/empty/'),
    ).toMatchObject({ directory: true });
  });

  it('reads names an old Russian archiver wrote in its code page', async () => {
    const name = new Uint8Array([
      0x8f, 0xae, 0xe5, 0xae, 0xa4, 0x2e, 0x74, 0x78, 0x74,
    ]);
    const { source } = bytesSource(
      handmadeZip([{ name, data: utf8('день 1') }]),
    );
    const { entries } = await readZipDirectory(source);
    expect(entries[0]!.name).toBe('Поход.txt');
  });

  it('reads sizes and offsets kept in ZIP64 records', async () => {
    const archive = handmadeZip(
      [
        { name: utf8('a.txt'), data: utf8('first') },
        { name: utf8('b/c.txt'), data: utf8('second file') },
      ],
      { zip64: true },
    );
    const { source } = bytesSource(archive);
    const directory = await readZipDirectory(source);
    expect(directory.count).toBe(2);
    // The second file's local header follows the first's 30 + 5 + 5 bytes.
    expect(
      directory.entries.map(({ name, size, packedSize, offset }) => [
        name,
        size,
        packedSize,
        offset,
      ]),
    ).toEqual([
      ['a.txt', 5, 5, 0],
      ['b/c.txt', 11, 11, 40],
    ]);
  });

  it('says plainly when a file is no archive', async () => {
    const { source } = bytesSource(utf8('just text, no end record here'));
    await expect(readZipDirectory(source)).rejects.toBeInstanceOf(ZipReadError);
  });
});

describe('zip names and fields', () => {
  it('tells an encrypted file by its flag', async () => {
    const { source } = bytesSource(
      handmadeZip([{ name: utf8('secret.txt'), data: utf8('x'), flags: 1 }]),
    );
    const { entries } = await readZipDirectory(source);
    expect(entries[0]!.encrypted).toBe(true);
  });

  it('reads names a Western archiver wrote in code page 437', async () => {
    // «Übersicht.pdf»: Ü is 0x9a in code page 437, «š» in windows-1252.
    const name = new Uint8Array([0x9a, ...utf8('bersicht.pdf')]);
    const { source } = bytesSource(handmadeZip([{ name, data: utf8('x') }]));
    const { entries } = await readZipDirectory(source);
    expect(entries[0]!.name).toBe('Übersicht.pdf');
  });

  it('stops at an extra field longer than the room left for it', async () => {
    const archive = handmadeZip(
      [{ name: utf8('a.txt'), data: utf8('first') }],
      {
        zip64: true,
      },
    );
    // The ZIP64 field of the one record says it is far longer than it is.
    const fieldLength = 35 + 5 + 46 + 5 + 2;
    new DataView(archive.buffer).setUint16(fieldLength, 200, true);
    const { source } = bytesSource(archive);
    const { entries } = await readZipDirectory(source);
    expect(entries.map((entry) => entry.name)).toEqual(['a.txt']);
    // Its sizes stayed unknown: it is listed, and never unpacked.
    expect(entries[0]!.size).toBe(0xffffffff);
  });
});

describe('zip tree', () => {
  const collator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
  });

  it('lays out folders from the paths, counted and weighed', async () => {
    const archive = zipSync({
      'report/photos/day 10.jpg': new Uint8Array(30),
      'report/photos/day 2.jpg': new Uint8Array(20),
      'report/index.html': utf8('<p>1</p>'),
      'report/empty/': new Uint8Array(0),
      'notes.txt': utf8('notes'),
    });
    const { source } = bytesSource(archive);
    const { entries } = await readZipDirectory(source);
    const root = zipTree(entries, collator.compare);
    expect(root).toMatchObject({ name: '', path: '', count: 4, size: 63 });
    expect(root.folders.map((folder) => folder.name)).toEqual(['report']);
    expect(root.files.map((entry) => entry.name)).toEqual(['notes.txt']);
    const report = root.folders[0]!;
    expect(report).toMatchObject({ path: 'report', count: 3, size: 58 });
    // An empty folder is there by its own entry; numbers sort as numbers.
    expect(report.folders.map((folder) => folder.name)).toEqual([
      'empty',
      'photos',
    ]);
    const photos = report.folders[1]!;
    expect(photos.parent).toBe(report);
    expect(photos.files.map((entry) => zipEntryBaseName(entry.name))).toEqual([
      'day 2.jpg',
      'day 10.jpg',
    ]);
  });
});
