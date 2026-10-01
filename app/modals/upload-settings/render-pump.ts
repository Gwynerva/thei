export interface RenderPumpTimers {
  set: (callback: () => void, delayMs: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface RenderPumpOptions<TItem extends { key: string }, TResult> {
  /** Requests kept under way at once. */
  window: number;
  /** How long a change settles before new requests go out. */
  delayMs: number;
  fetch: (item: TItem, signal: AbortSignal) => Promise<TResult>;
  onResult: (key: string, result: TResult) => void;
  onFailure: (key: string, reason: unknown) => void;
  /** Already answered: never asked for again. */
  has: (key: string) => boolean;
  timers?: RenderPumpTimers;
}

/**
 * Keeps a few requests under way over a list of wanted keys, the most wanted
 * first, and no more than the server would run at once.
 *
 * The list changes with every edit. Requests for keys no longer wanted are
 * dropped the moment the list changes — that is the cancellation, and the
 * sooner the better — while new ones wait for the change to settle, so a drag
 * of the frame is one set of requests rather than one per step. A settled
 * request sends the next wanted one, unless a change is still settling. A
 * failed key is not asked for again until `retry`: a request the server
 * refuses would otherwise be repeated for ever.
 */
export class RenderPump<TItem extends { key: string }, TResult> {
  private wanted: TItem[] = [];
  private readonly inflight = new Map<string, AbortController>();
  private readonly failed = new Set<string>();
  private timer: unknown;
  private held = false;
  private readonly timers: RenderPumpTimers;

  constructor(private readonly options: RenderPumpOptions<TItem, TResult>) {
    this.timers = options.timers ?? {
      set: (callback, delayMs) => setTimeout(callback, delayMs),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  }

  /** What is worth having now, in order of worth. */
  setWanted(items: TItem[]) {
    this.wanted = items.filter((item) => item.key);
    const keys = new Set(this.wanted.map((item) => item.key));
    for (const [key, controller] of this.inflight) {
      if (keys.has(key)) continue;
      controller.abort();
      this.inflight.delete(key);
    }
    this.clearTimer();
    if (this.held || !this.next()) return;
    this.timer = this.timers.set(() => {
      this.timer = undefined;
      this.pump();
    }, this.options.delayMs);
  }

  /**
   * Keeps one request and stops every other, until released: what "Use"
   * stores must not wait its turn behind dry runs of stops not chosen.
   */
  hold(keepKey: string) {
    this.held = true;
    this.clearTimer();
    for (const [key, controller] of this.inflight) {
      if (key === keepKey) continue;
      controller.abort();
      this.inflight.delete(key);
    }
  }

  release() {
    if (!this.held) return;
    this.held = false;
    this.pump();
  }

  retry() {
    this.failed.clear();
    this.pump();
  }

  abortAll() {
    this.clearTimer();
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
  }

  /** Forgets everything, for another source. */
  reset() {
    this.abortAll();
    this.failed.clear();
    this.held = false;
  }

  isInflight(key: string) {
    return this.inflight.has(key);
  }

  hasFailed(key: string) {
    return this.failed.has(key);
  }

  private next(): TItem | undefined {
    return this.wanted.find(
      (item) =>
        !this.options.has(item.key) &&
        !this.inflight.has(item.key) &&
        !this.failed.has(item.key),
    );
  }

  private pump() {
    if (this.held) return;
    while (this.inflight.size < this.options.window) {
      const item = this.next();
      if (!item) return;
      void this.send(item);
    }
  }

  private async send(item: TItem) {
    const controller = new AbortController();
    this.inflight.set(item.key, controller);
    try {
      const result = await this.options.fetch(item, controller.signal);
      if (!controller.signal.aborted) this.options.onResult(item.key, result);
    } catch (reason) {
      if (!controller.signal.aborted) {
        this.failed.add(item.key);
        this.options.onFailure(item.key, reason);
      }
    } finally {
      if (this.inflight.get(item.key) === controller) {
        this.inflight.delete(item.key);
      }
      // A dropped request is followed by nothing: the change that dropped it
      // is still settling, and its timer sends what comes next.
      if (!controller.signal.aborted && this.timer === undefined) this.pump();
    }
  }

  private clearTimer() {
    if (this.timer === undefined) return;
    this.timers.clear(this.timer);
    this.timer = undefined;
  }
}
