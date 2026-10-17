import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readZipEntry } from '../../../app/composables/file-preview/zip';
import { blobByteSource } from '../../../app/composables/file-preview/source';
import {
  readZipDirectory,
  ZipReadError,
  type ByteSource,
} from '../../../shared/zip-directory';

/**
 * A file of an archive is unpacked in the browser, stored or deflated, never
 * past the limit and from no more packed bytes than what it may unpack to,
 * whatever the archive claims of it.
 */

const utf8 = (text: string) => new TextEncoder().encode(text);

/** A source that tells how much each read asked for. */
function counted(bytes: Uint8Array) {
  const source = blobByteSource(new Blob([bytes]));
  const reads: number[] = [];
  const counting: ByteSource = {
    size: source.size,
    read: (start, end, signal) => (
      reads.push(end - start),
      source.read(start, end, signal)
    ),
  };
  return { source: counting, reads };
}

describe('a file of an archive', () => {
  it('unpacks a stored and a deflated file', async () => {
    const { source } = counted(
      zipSync({
        'stored.txt': [utf8('as is'), { level: 0 }],
        'packed.txt': utf8('сжато '.repeat(500)),
      }),
    );
    const { entries } = await readZipDirectory(source);
    const read = async (name: string) =>
      new TextDecoder().decode(
        await readZipEntry(
          source,
          entries.find((entry) => entry.name === name)!,
          1024 * 1024,
        ),
      );
    expect(await read('stored.txt')).toBe('as is');
    expect(await read('packed.txt')).toBe('сжато '.repeat(500));
  });

  it('stops unpacking at the limit, whatever the archive claims', async () => {
    const { source } = counted(
      zipSync({ 'zeros.bin': new Uint8Array(200_000) }),
    );
    const [entry] = (await readZipDirectory(source)).entries;
    await expect(readZipEntry(source, entry!, 1000)).rejects.toMatchObject({
      reason: 'too-large',
    });
    // An archive that lies about the size is stopped while unpacking.
    await expect(
      readZipEntry(source, { ...entry!, size: 10 }, 1000),
    ).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('is refused unread when it is packed larger than it may unpack to', async () => {
    const zipped = zipSync({ 'notes.txt': utf8('день 1\n'.repeat(1000)) });
    const { source, reads } = counted(zipped);
    const [entry] = (await readZipDirectory(source)).entries;
    reads.length = 0;
    // A directory that claims a small file packed into hundreds of megabytes.
    const lying = { ...entry!, packedSize: 400 * 1024 * 1024 };
    const read = readZipEntry(source, lying, 1024 * 1024);
    await expect(read).rejects.toBeInstanceOf(ZipReadError);
    await expect(read).rejects.toMatchObject({ reason: 'too-large' });
    expect(reads).toEqual([]);

    // Only its start, it is fetched no further than that start needs.
    await readZipEntry(source, lying, 1024, { head: true }).catch(() => {});
    expect(Math.max(...reads)).toBeLessThanOrEqual(1024 + 65536);
  });

  it('refuses an encrypted file', async () => {
    const { source } = counted(zipSync({ 'secret.txt': utf8('x') }));
    const [entry] = (await readZipDirectory(source)).entries;
    await expect(
      readZipEntry(source, { ...entry!, encrypted: true }, 1000),
    ).rejects.toMatchObject({ reason: 'unsupported' });
  });
});

describe('the start of a file of an archive', () => {
  it('unpacks only the start of a long file, and fetches little more', async () => {
    const text = 'line of a long log\n'.repeat(50_000);
    const { source, reads } = counted(
      zipSync({
        'stored.log': [utf8(text), { level: 0 }],
        'packed.log': utf8(text),
      }),
    );
    const { entries } = await readZipDirectory(source);
    for (const name of ['stored.log', 'packed.log']) {
      reads.length = 0;
      const entry = entries.find((item) => item.name === name)!;
      const bytes = await readZipEntry(source, entry, 1000, { head: true });
      expect(new TextDecoder().decode(bytes)).toBe(text.slice(0, 1000));
      expect(Math.max(...reads)).toBeLessThanOrEqual(1000 + 65536);
    }
  });

  it('stops when told to', async () => {
    const { source } = counted(zipSync({ 'a.txt': utf8('words') }));
    const [entry] = (await readZipDirectory(source)).entries;
    const controller = new AbortController();
    controller.abort();
    await expect(
      readZipEntry(source, entry!, 1000, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
