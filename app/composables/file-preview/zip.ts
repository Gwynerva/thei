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

/**
 * How much larger than what it unpacks to a deflated file may be: data it
 * cannot shrink is kept in stored blocks of a few bytes' header each, which
 * add far less than this to a file of the sizes a preview reads.
 */
const DEFLATE_SLACK = 65536;

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
  // No more is fetched than `maxBytes` can come from: deflate never makes
  // data much larger, so a little past it packed unpacks to at least that
  // much. A whole file packed larger than that unpacks larger than it too,
  // whatever the archive claims of it, and is refused before it is fetched.
  const packedLimit = maxBytes + (entry.method === 0 ? 0 : DEFLATE_SLACK);
  if (!head && entry.packedSize > packedLimit)
    throw new ZipReadError('too-large');
  const start = await zipEntryDataStart(source, entry);
  const fetched = Math.min(entry.packedSize, packedLimit);
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
