import { concatBytes } from '#layers/thei/shared/bytes';
import {
  isZipEntryReadable,
  zipEntryDataStart,
  ZipReadError,
  type ByteSource,
  type ZipEntry,
} from '#layers/thei/shared/zip-directory';

/** A file taken out of an archive, to be shown as a file of its own. */
export interface ArchiveFile {
  /** Its path inside the archive. */
  name: string;
  extension: string;
  file: Blob;
}

export interface ZipEntryReadOptions {
  signal?: AbortSignal;
  /**
   * Only the start is wanted, up to `maxBytes`: a larger file is not
   * refused but cut there.
   */
  head?: boolean;
}

/**
 * A file of an archive, unpacked by the browser's own `DecompressionStream`:
 * one read of its packed bytes, nothing for the server to do. Unpacking
 * stops at `maxBytes`, whatever the archive says the file weighs, and when
 * `signal` says so.
 */
export async function readZipEntry(
  source: ByteSource,
  entry: ZipEntry,
  maxBytes: number,
  { signal, head = false }: ZipEntryReadOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (!isZipEntryReadable(entry, head ? Infinity : maxBytes))
    throw new ZipReadError(entry.size > maxBytes ? 'too-large' : 'unsupported');
  const start = await zipEntryDataStart(source, entry);
  // For a start, no more is fetched than it can take: deflate never makes
  // data much larger, so a little past `maxBytes` packed unpacks to at
  // least that much.
  const fetched = head
    ? Math.min(entry.packedSize, maxBytes + (entry.method === 0 ? 0 : 65536))
    : entry.packedSize;
  const cut = fetched < entry.packedSize;
  const packed = await source.read(start, start + fetched, signal);
  if (entry.method === 0) return packed;

  const reader = new Blob([packed])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
      signal.throwIfAborted();
    }
    let next: ReadableStreamReadResult<Uint8Array>;
    try {
      next = await reader.read();
    } catch (reason) {
      // Packed bytes cut short end in the middle of a block: what came out
      // of them before is the start that was asked for.
      if (cut) return concatBytes(chunks, Math.min(total, maxBytes));
      throw reason;
    }
    const { done, value } = next;
    if (done) break;
    total += value.length;
    chunks.push(value);
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      if (head) return concatBytes(chunks, maxBytes);
      throw new ZipReadError('too-large');
    }
  }
  return concatBytes(chunks, total);
}
