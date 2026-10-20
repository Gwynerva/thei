/**
 * Forgetting what the AI keeps, with a moment to bring it back: what is
 * forgotten hides at once and is deleted once its toast is gone — timed
 * out, closed, or taken by the next one — or when the page is left, unless
 * brought back first.
 */
export function useUndoableForget() {
  const hidden = ref(new Set<string>());
  const pending = new Map<string, () => Promise<unknown>>();
  const toast = useToast();

  function unhide(key: string) {
    const next = new Set(hidden.value);
    next.delete(key);
    hidden.value = next;
  }

  function go(key: string) {
    const run = pending.get(key);
    if (!run) return;
    pending.delete(key);
    void aiAttempt(run).then((done) => done || unhide(key));
  }

  function forget(key: string, run: () => Promise<unknown>) {
    hidden.value = new Set(hidden.value).add(key);
    pending.set(key, run);
    const id = showToast(phrase.value.ai_memory_forgotten, {
      label: phrase.value.ai_memory_restore,
      run: () => {
        if (!pending.delete(key)) return;
        unhide(key);
      },
    });
    // After the toast's own action has run, if it ran.
    const stop = watch(
      toast,
      (now) => {
        if (now?.id === id) return;
        stop();
        go(key);
      },
      { flush: 'post' },
    );
  }

  /** The page going: what waits is sent now, keepalive. */
  function flush() {
    for (const key of [...pending.keys()]) go(key);
  }
  if (import.meta.client) {
    window.addEventListener('pagehide', flush);
    onBeforeUnmount(() => {
      window.removeEventListener('pagehide', flush);
      flush();
    });
  }

  return { hidden, forget };
}
