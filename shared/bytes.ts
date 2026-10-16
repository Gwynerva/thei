/**
 * Pieces of bytes as one, cut at `total` when given: the start of a file
 * read a chunk at a time, or a file unpacked.
 */
export function concatBytes(
  chunks: readonly Uint8Array[],
  total = chunks.reduce((sum, chunk) => sum + chunk.length, 0),
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    if (at >= total) break;
    bytes.set(chunk.subarray(0, Math.min(chunk.length, total - at)), at);
    at += chunk.length;
  }
  return bytes;
}
