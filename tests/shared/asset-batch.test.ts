import { describe, expect, it } from 'vitest';
import { runAssetBatch } from '../../shared/asset-batch';

describe('asset batch', () => {
  it('limits concurrency, preserves input order and keeps partial successes', async () => {
    let active = 0;
    let maxActive = 0;
    const result = await runAssetBatch(
      [30, 5, 20, 1],
      async (delay, index) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active--;
        if (index === 2) throw new Error('invalid media');
        return `item-${index}`;
      },
      2,
    );

    expect(maxActive).toBe(2);
    expect(result.map((item) => item.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    expect(
      result.flatMap((item) =>
        item.status === 'fulfilled' ? [item.value] : [],
      ),
    ).toEqual(['item-0', 'item-1', 'item-3']);
  });
});
