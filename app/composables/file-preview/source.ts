import { concatBytes } from '#layers/thei/shared/bytes';
import type { ByteSource } from '#layers/thei/shared/zip-directory';
import { sitePath } from '../site-url';

/** Both signals, or the one there is: a read stops when either says so. */
function eitherSignal(a?: AbortSignal, b?: AbortSignal) {
  return a && b ? AbortSignal.any([a, b]) : (a ?? b);
}

/**
 * A file of the site read with Range requests: only the bytes asked for come
 * over. A server that sends the whole file anyway is read only as far as
 * needed, and the rest is left unread. Every read stops once `signal` does:
 * the window has moved on to another file.
 */
export function urlByteSource(
  path: string,
  size: number,
  signal?: AbortSignal,
): ByteSource {
  const url = sitePath(path);
  return {
    size,
    async read(start, end, readSignal) {
      if (end <= start) return new Uint8Array(0);
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end - 1}` },
        signal: eitherSignal(signal, readSignal),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.status === 206 || !response.body)
        return new Uint8Array(await response.arrayBuffer());
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < end) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      await reader.cancel().catch(() => {});
      return concatBytes(chunks, Math.min(total, end)).slice(start, end);
    },
  };
}

/** A file at hand: picked before it is uploaded, or unpacked from an archive. */
export function blobByteSource(blob: Blob, signal?: AbortSignal): ByteSource {
  return {
    size: blob.size,
    async read(start, end, readSignal) {
      eitherSignal(signal, readSignal)?.throwIfAborted();
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
}
