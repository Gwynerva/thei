/**
 * Goes through stored files one at a time, telling `onProgress` once before
 * the first and after each: the walk of every update task over the library.
 */
export async function eachWithProgress<T>(
  items: readonly T[],
  onProgress:
    ((done: number, total: number) => void | Promise<void>) | undefined,
  visit: (item: T) => Promise<void>,
): Promise<void> {
  await onProgress?.(0, items.length);
  let done = 0;
  for (const item of items) {
    await visit(item);
    done += 1;
    await onProgress?.(done, items.length);
  }
}
