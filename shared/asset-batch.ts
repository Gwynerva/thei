export async function runAssetBatch<TInput, TOutput>(
  items: readonly TInput[],
  handler: (item: TInput, index: number) => Promise<TOutput>,
  concurrency = 3,
): Promise<PromiseSettledResult<TOutput>[]> {
  const results = new Array<PromiseSettledResult<TOutput>>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await handler(items[index]!, index),
        };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(
    items.length,
    Math.max(1, Math.floor(concurrency)),
  );
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
