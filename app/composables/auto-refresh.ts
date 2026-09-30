import { onMounted, onUnmounted } from 'vue';

export interface AutoRefreshOptions {
  /** How long to wait between refreshes while they succeed. */
  interval: number;
  /** The longest wait, reached after failures in a row. */
  maxInterval?: number;
  /** Whether a refresh would be wasted now: nobody sees it, or there is no network. */
  paused?: () => boolean;
}

export interface AutoRefresh {
  start(): void;
  stop(): void;
  /** The page is seen again, or back online: makes up a refresh skipped meanwhile. */
  resume(): void;
  /** Refreshes now, whatever the pause or the wait. Never throws. */
  forceRefresh(): Promise<void>;
}

/**
 * Refreshes something every `interval`, one refresh at a time.
 *
 * A refresh that throws has failed, and the wait doubles after each failure
 * in a row, up to `maxInterval`, so a page left open through an outage does
 * not keep knocking. While `paused`, a refresh that falls due is skipped and
 * made up on `resume`. A refresh asked for while another is under way starts
 * after it, so an older answer never lands after a newer one.
 */
export function createAutoRefresh(
  refresh: () => Promise<unknown>,
  {
    interval,
    maxInterval = interval * 8,
    paused = () => false,
  }: AutoRefreshOptions,
): AutoRefresh {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let failures = 0;
  /** A refresh fell due while paused. */
  let due = false;
  let active: Promise<void> | undefined;
  let queued: Promise<void> | undefined;

  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    if (!started) return;
    timer = setTimeout(tick, Math.min(interval * 2 ** failures, maxInterval));
  }

  function tick() {
    timer = undefined;
    if (paused()) due = true;
    else void run();
  }

  async function once() {
    clearTimeout(timer);
    timer = undefined;
    due = false;
    try {
      await refresh();
      failures = 0;
    } catch {
      failures += 1;
    }
  }

  function run(): Promise<void> {
    if (queued) return queued;
    if (active) {
      queued = active.then(() => {
        queued = undefined;
        return run();
      });
      return queued;
    }
    const current = once().finally(() => {
      active = undefined;
      // The refresh waiting for this one schedules the next itself.
      if (!queued) schedule();
    });
    active = current;
    return current;
  }

  return {
    start() {
      started = true;
      failures = 0;
      due = false;
      schedule();
    },
    stop() {
      started = false;
      clearTimeout(timer);
      timer = undefined;
    },
    resume() {
      if (started && due && !paused()) void run();
    },
    forceRefresh: run,
  };
}

/**
 * Refreshes while the component is mounted. It rests while the page is
 * hidden or the browser is offline, and catches up once it is back.
 */
export function useAutoRefresh(
  refreshFn: () => Promise<unknown>,
  interval: number = 5000,
) {
  const auto = createAutoRefresh(refreshFn, {
    interval,
    paused: () =>
      document.visibilityState === 'hidden' || navigator.onLine === false,
  });

  onMounted(() => {
    auto.start();
    document.addEventListener('visibilitychange', auto.resume);
    window.addEventListener('online', auto.resume);
  });

  onUnmounted(() => {
    auto.stop();
    document.removeEventListener('visibilitychange', auto.resume);
    window.removeEventListener('online', auto.resume);
  });

  return { forceRefresh: auto.forceRefresh };
}
