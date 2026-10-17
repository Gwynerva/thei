/**
 * Values in groups one `IN (…)` takes: SQLite binds a bounded number of
 * parameters per statement, so a long list is asked in a few queries.
 */
export function inChunks<T>(items: readonly T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}
