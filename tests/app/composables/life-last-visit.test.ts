import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLifeVisitTracker,
  LIFE_VIEW_CONFIRMATION_DELAY,
} from '../../../app/composables/life-last-visit';

function harness(stored?: string) {
  const state = {
    activeDate: '2026-08-21',
    newestDate: '2026-08-22',
    path: '/life/2026/08/21/',
    visible: true,
    focused: true,
    stored,
  };
  const writes: string[] = [];
  let removed = false;
  const tracker = createLifeVisitTracker({
    getActiveDate: () => state.activeDate,
    getNewestDate: () => state.newestDate,
    getPath: () => state.path,
    isVisible: () => state.visible,
    isFocused: () => state.focused,
    read: () => state.stored ?? null,
    write: (date) => {
      state.stored = date;
      writes.push(date);
    },
    remove: () => {
      state.stored = undefined;
      removed = true;
    },
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
  });
  return { state, writes, tracker, wasRemoved: () => removed };
}

afterEach(() => vi.useRealTimers());

describe('Life last-visit tracker', () => {
  it('creates a baseline after a meaningful first visit without highlighting history', () => {
    vi.useFakeTimers();
    const { tracker, writes } = harness();
    tracker.initialize();
    expect(tracker.isNewDate('2026-08-22')).toBe(false);
    vi.advanceTimersByTime(LIFE_VIEW_CONFIRMATION_DELAY - 1);
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(writes).toEqual(['2026-08-21']);
  });

  it('cancels confirmation when the active block changes', () => {
    vi.useFakeTimers();
    const { state, tracker, writes } = harness('2026-08-20');
    tracker.initialize();
    vi.advanceTimersByTime(2_000);
    state.activeDate = '2026-08-22';
    state.path = '/life/2026/08/22/';
    tracker.considerActiveDay();
    vi.advanceTimersByTime(1_000);
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(writes).toEqual(['2026-08-22']);
  });

  it('pauses while hidden and confirms only continuous visible time', () => {
    vi.useFakeTimers();
    const { state, tracker, writes } = harness('2026-08-20');
    tracker.initialize();
    state.visible = false;
    tracker.considerActiveDay();
    vi.advanceTimersByTime(5_000);
    expect(writes).toEqual([]);
    state.visible = true;
    tracker.considerActiveDay();
    vi.advanceTimersByTime(LIFE_VIEW_CONFIRMATION_DELAY);
    expect(writes).toEqual(['2026-08-21']);
  });

  it('advances only to the viewed deep-linked block and freezes session styling', () => {
    vi.useFakeTimers();
    const { tracker, writes } = harness('2026-08-20');
    tracker.initialize();
    expect(tracker.isNewDate('2026-08-21')).toBe(true);
    expect(tracker.isNewDate('2026-08-22')).toBe(true);
    vi.advanceTimersByTime(LIFE_VIEW_CONFIRMATION_DELAY);
    expect(writes).toEqual(['2026-08-21']);
    expect(tracker.isNewDate('2026-08-21')).toBe(true);
    expect(tracker.isNewDate('2026-08-22')).toBe(true);
  });

  it('repairs malformed and future markers safely', () => {
    vi.useFakeTimers();
    const malformed = harness('not-a-day');
    malformed.tracker.initialize();
    expect(malformed.wasRemoved()).toBe(true);

    const future = harness('2027-01-01');
    future.tracker.initialize();
    expect(future.writes[0]).toBe('2026-08-22');
    expect(future.tracker.isNewDate('2026-08-22')).toBe(false);
  });
});
