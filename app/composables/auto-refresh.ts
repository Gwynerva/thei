import { onMounted, onUnmounted } from 'vue';

export function useAutoRefresh(
  refreshFn: () => Promise<unknown>,
  interval: number = 5000,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let promise: Promise<unknown> | undefined;

  async function poll() {
    clearTimeout(timeout);

    if (promise) {
      return promise;
    }

    promise = refreshFn()
      .catch(() => null)
      .finally(() => {
        promise = undefined;
        if (!stopped) {
          timeout = setTimeout(poll, interval);
        }
      });

    return promise;
  }

  async function forceRefresh() {
    clearTimeout(timeout);
    try {
      await refreshFn();
    } catch {
      // caller handles error
    } finally {
      if (!stopped) {
        timeout = setTimeout(poll, interval);
      }
    }
  }

  onMounted(() => {
    stopped = false;
    timeout = setTimeout(poll, interval);
  });

  onUnmounted(() => {
    stopped = true;
    clearTimeout(timeout);
  });

  return { forceRefresh };
}
