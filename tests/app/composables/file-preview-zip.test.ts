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
 * A file of an archive is unpacked from no more packed bytes than what it
 * may unpack to, whatever the archive claims of it.
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
  it('is unpacked whole when it is what it says', async () => {
    const zipped = zipSync({ 'notes.txt': utf8('день 1\n'.repeat(1000)) });
    const { source } = counted(zipped);
    const [entry] = (await readZipDirectory(source)).entries;
    const bytes = await readZipEntry(source, entry!, 1024 * 1024);
    expect(new TextDecoder().decode(bytes)).toBe('день 1\n'.repeat(1000));
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
});
