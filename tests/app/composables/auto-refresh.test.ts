import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoRefresh } from '../../../app/composables/auto-refresh';

const INTERVAL = 1000;

/** A refresh that takes `duration` and fails while `failing` says so. */
function refresher({ duration = 0 } = {}) {
  const state = { failing: false, calls: 0, finished: [] as number[] };
  const refresh = vi.fn(async () => {
    const call = ++state.calls;
    if (duration) await new Promise((resolve) => setTimeout(resolve, duration));
    state.finished.push(call);
    if (state.failing) throw new Error('offline');
  });
  return { refresh, state };
}

describe('auto refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes after each interval, never at once, and counts from the end of a slow one', async () => {
    const { refresh } = refresher({ duration: 300 });
    const auto = createAutoRefresh(refresh, { interval: INTERVAL });
    auto.start();
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refresh).toHaveBeenCalledTimes(1);
    // The refresh takes 300 ms; the next interval starts after it.
    await vi.advanceTimersByTimeAsync(INTERVAL + 299);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    auto.stop();
  });

  it('waits twice as long after each failure, up to eight times, and resets on success', async () => {
    const { refresh, state } = refresher();
    const auto = createAutoRefresh(refresh, { interval: INTERVAL });
    state.failing = true;
    auto.start();
    const moments: number[] = [];
    let elapsed = 0;
    for (let index = 0; index < 6; index += 1) {
      const before = refresh.mock.calls.length;
      while (refresh.mock.calls.length === before) {
        await vi.advanceTimersByTimeAsync(100);
        elapsed += 100;
      }
      moments.push(elapsed);
      if (index === 3) state.failing = false;
    }
    const waits = moments.map((moment, index) =>
      index ? moment - moments[index - 1]! : moment,
    );
    // The first after the interval, then 2×, 4×, 8×, 8× after failures, and
    // the interval again after the success.
    expect(waits).toEqual([1000, 2000, 4000, 8000, 8000, 1000]);
    auto.stop();
  });

  it('skips a refresh while paused and makes it up on resume', async () => {
    const { refresh } = refresher();
    let paused = true;
    const auto = createAutoRefresh(refresh, {
      interval: INTERVAL,
      paused: () => paused,
    });
    auto.start();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(refresh).not.toHaveBeenCalled();

    // Still paused: nothing yet.
    auto.resume();
    expect(refresh).not.toHaveBeenCalled();

    paused = false;
    auto.resume();
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    // Nothing is due any more: resuming again refreshes nothing.
    auto.resume();
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refresh).toHaveBeenCalledTimes(2);
    auto.stop();
  });

  it('refreshes at once when forced, even paused or waiting out failures, and never throws', async () => {
    const { refresh, state } = refresher();
    const auto = createAutoRefresh(refresh, {
      interval: INTERVAL,
      paused: () => true,
    });
    state.failing = true;
    auto.start();
    await expect(auto.forceRefresh()).resolves.toBeUndefined();
    await expect(auto.forceRefresh()).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(2);
    // One timer only, and paused: nothing more runs by itself.
    await vi.advanceTimersByTimeAsync(INTERVAL * 20);
    expect(refresh).toHaveBeenCalledTimes(2);
    auto.stop();
  });

  it('starts a forced refresh after the one under way, never alongside', async () => {
    const { refresh, state } = refresher({ duration: 500 });
    const auto = createAutoRefresh(refresh, { interval: INTERVAL });
    auto.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refresh).toHaveBeenCalledTimes(1);
    const first = auto.forceRefresh();
    const second = auto.forceRefresh();
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([first, second]);
    expect(state.finished).toEqual([1, 2]);
    // The forced refresh schedules the next one, a whole interval later.
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(3);
    auto.stop();
  });

  it('schedules nothing once stopped, even after a refresh that was under way', async () => {
    const { refresh } = refresher({ duration: 500 });
    const auto = createAutoRefresh(refresh, { interval: INTERVAL });
    auto.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refresh).toHaveBeenCalledTimes(1);
    auto.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 10);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
