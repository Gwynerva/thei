import {
  type UpdateProgress,
  type UpdateScreenState,
  updateScreenState,
} from '#layers/thei/shared/api/update-progress';

const POLL_INTERVAL_MS = 1000;
/** Long enough for a busy server, short enough to notice one that went away. */
const REQUEST_TIMEOUT_MS = 5000;

export type UpdateOverlayMode = 'update' | 'restart';

/** What the update overlay was asked to show; `undefined` while it is closed. */
export const useUpdateOverlayRequest = () =>
  useState<UpdateOverlayMode | undefined>('update-overlay-request');

/**
 * Opens the full-screen update overlay: for the update that was just
 * started, or for a restart that was just asked for.
 */
export function openUpdateOverlay(mode: UpdateOverlayMode = 'update') {
  useUpdateOverlayRequest().value = mode;
}

/**
 * Polls the update's progress — before the restart, through it, when the
 * server does not answer at all, and while the site is closed — and keeps the
 * last answer when a request fails, so the steps stay on screen.
 *
 * Nothing here loads code on demand: the page that polls may belong to a
 * build that has already been replaced on disk.
 */
export function useUpdateProgress() {
  const progress = shallowRef<UpdateProgress>();
  const offline = ref(false);
  const screen = computed<UpdateScreenState>(() =>
    updateScreenState(progress.value, offline.value),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  // After asking the server to restart, its answers are stale until it has
  // actually gone away: the old process lingers for a moment before it exits.
  let awaitingRestart = false;
  let wentAway = false;

  async function refresh() {
    try {
      const answer = await $fetch<UpdateProgress>('/api/update/progress', {
        timeout: REQUEST_TIMEOUT_MS,
        retry: 0,
      });
      if (awaitingRestart && !wentAway) return progress.value;
      awaitingRestart = false;
      progress.value = answer;
      offline.value = false;
    } catch {
      offline.value = true;
      wentAway = true;
    }
    return progress.value;
  }

  async function tick() {
    await refresh();
    if (!polling) return;
    // Once the site is open again nothing more happens on its own.
    if (
      !awaitingRestart &&
      (screen.value === 'done' || screen.value === 'failed-open')
    ) {
      polling = false;
      return;
    }
    timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  function start() {
    if (polling) return;
    polling = true;
    void tick();
  }

  function stop() {
    polling = false;
    clearTimeout(timer);
  }

  /** The server was asked to restart: wait for it to go and come back. */
  function expectRestart() {
    awaitingRestart = true;
    wentAway = false;
    // Shown as waiting from the start: the server is on its way down.
    offline.value = true;
    stop();
    start();
  }

  /**
   * Asks a site that stayed closed after a failed step to try again, and
   * follows the restart. Resolves to the reason if the server refused.
   */
  async function retry(): Promise<string | undefined> {
    try {
      await $fetch('/api/update/retry', { method: 'POST' });
    } catch (thrown) {
      return (
        (thrown as { data?: { statusMessage?: string } })?.data
          ?.statusMessage ??
        (thrown instanceof Error ? thrown.message : String(thrown))
      );
    }
    expectRestart();
  }

  onBeforeUnmount(stop);

  return {
    progress,
    offline,
    screen,
    refresh,
    start,
    stop,
    expectRestart,
    retry,
  };
}
