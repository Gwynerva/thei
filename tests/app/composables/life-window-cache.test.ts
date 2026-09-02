import { describe, expect, it } from 'vitest';
import {
  cacheLifeWindow,
  evictLifeWindows,
  lifeFeedRows,
} from '../../../app/composables/life-window-cache';
import type { LifeWindowResponse } from '../../../shared/life';

const windowData = (date: string, count = 1): LifeWindowResponse => ({
  anchorDate: date,
  newestDate: '2026-12-31',
  newerCursor: `${date}:newer`,
  olderCursor: `${date}:older`,
  days: [
    {
      date,
      points: Array.from({ length: count }, (_, index) => ({
        visibility: 'visible',
        key: `${date}:${index}`,
        date,
        entityKind: 'page',
        transition: 'created',
        title: 'Page',
        summary: '',
        href: '/pages/page/',
      })),
    },
  ],
});

describe('bounded life windows', () => {
  it('virtualizes individual cards in a dense day and the intervening gaps', () => {
    const rows = lifeFeedRows([
      cacheLifeWindow(windowData('2026-09-02', 5000), {}),
      cacheLifeWindow(windowData('2026-09-01'), {}),
    ]);
    expect(rows).toHaveLength(5002);
    expect(rows.filter((row) => row.kind === 'gap')).toHaveLength(1);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
  it('evicts distant payloads, retaining focus, the active window and reload cursors', () => {
    const windows = Array.from({ length: 30 }, (_, index) => {
      const date = `2026-09-${String(30 - index).padStart(2, '0')}`;
      return cacheLifeWindow(windowData(date), {
        cursor: date,
        direction: 'older',
      });
    });
    const heights = new Map(windows.map((window) => [window.id, 700]));
    const focused = windows[0]!;
    const active = windows[29]!;
    evictLifeWindows(windows, active.id, new Set([focused.id]), heights);
    expect(windows.filter((window) => window.data)).toHaveLength(10);
    expect(focused.data).toBeDefined();
    expect(active.data).toBeDefined();
    const removed = windows[1]!;
    expect(removed.data).toBeUndefined();
    expect(removed.request.cursor).toBe('2026-09-29');
    expect(
      lifeFeedRows(windows).find((row) => row.windowId === removed.id),
    ).toMatchObject({ kind: 'window', height: 700 });
    removed.data = windowData(removed.firstDate);
    evictLifeWindows(windows, removed.id, new Set([focused.id]), heights);
    expect(windows.filter((window) => window.data)).toHaveLength(10);
    expect(removed.data).toBeDefined();
  });
});
