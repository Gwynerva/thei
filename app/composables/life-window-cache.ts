import type { LifeDay, LifePoint, LifeWindowResponse } from '../../shared/life';
import {
  lifeGapDuration,
  type LifeGapDuration,
} from '../../shared/life-timeline';

export const LIFE_WINDOW_LIMIT = 10;
export const LIFE_SSR_ROWS = 24;
export type LifeWindowRequest = {
  period?: string;
  cursor?: string;
  direction?: 'newer' | 'older';
};
export interface LifeCachedWindow {
  id: string;
  request: LifeWindowRequest;
  data?: LifeWindowResponse;
  firstDate: string;
  lastDate: string;
  newerCursor?: string;
  olderCursor?: string;
  height: number;
}
type RowBase = { key: string; windowId: string; date: string };
export type LifeFeedRow = RowBase &
  (
    | { kind: 'point'; point: LifePoint; first: boolean; last: boolean }
    | { kind: 'gap'; newerDate: string; duration: LifeGapDuration }
    | { kind: 'window'; height: number }
  );

export function cacheLifeWindow(
  data: LifeWindowResponse,
  request: LifeWindowRequest,
): LifeCachedWindow {
  const firstDate = data.days[0]?.date ?? data.anchorDate;
  const lastDate = data.days.at(-1)?.date ?? firstDate;
  return {
    id: `${firstDate}:${lastDate}`,
    request,
    data,
    firstDate,
    lastDate,
    newerCursor: data.newerCursor,
    olderCursor: data.olderCursor,
    height: 0,
  };
}

export function lifeFeedRows(windows: LifeCachedWindow[]): LifeFeedRow[] {
  const rows: LifeFeedRow[] = [];
  let previousDate: string | undefined;
  for (const window of windows) {
    if (!window.data) {
      rows.push({
        kind: 'window',
        key: `window:${window.id}`,
        windowId: window.id,
        date: window.firstDate,
        height: window.height,
      });
      previousDate = window.lastDate;
      continue;
    }
    for (const day of window.data.days) {
      if (previousDate && previousDate !== day.date)
        rows.push({
          kind: 'gap',
          key: `gap:${day.date}`,
          windowId: window.id,
          date: day.date,
          newerDate: previousDate,
          duration: lifeGapDuration(previousDate, day.date),
        });
      day.points.forEach((point, index) =>
        rows.push({
          kind: 'point',
          key:
            point.visibility === 'visible'
              ? point.key
              : `${day.date}:${point.entityKind}:${point.transition}:${index}`,
          windowId: window.id,
          date: day.date,
          point,
          first: index === 0,
          last: index === day.points.length - 1,
        }),
      );
      previousDate = day.date;
    }
  }
  return rows;
}

/** Keep cursor/height metadata, but release cards, media and content of distant windows. */
export function evictLifeWindows(
  windows: LifeCachedWindow[],
  activeId: string,
  protectedIds: Set<string>,
  heights: Map<string, number>,
) {
  const active = Math.max(
    0,
    windows.findIndex((window) => window.id === activeId),
  );
  const loaded = windows.flatMap((window, index) =>
    window.data ? [{ window, index }] : [],
  );
  const candidates = loaded
    .filter(
      ({ window }) => window.id !== activeId && !protectedIds.has(window.id),
    )
    .sort(
      (left, right) =>
        Math.abs(right.index - active) - Math.abs(left.index - active),
    );
  for (const { window } of candidates.slice(
    0,
    Math.max(0, loaded.length - LIFE_WINDOW_LIMIT),
  )) {
    window.height = heights.get(window.id) ?? window.height;
    window.data = undefined;
  }
}

export function cachedLifeDays(windows: LifeCachedWindow[]): LifeDay[] {
  return windows.flatMap((window) => window.data?.days ?? []);
}
