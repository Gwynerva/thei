/**
 * How often one address may do what costs the site something: ask for a
 * connection, register an app, fail to exchange a key. Counted in memory
 * over a sliding window; a restart forgets, which errs on the open side.
 */
class RateWindow {
  /** The times counted, by key; the key counted longest ago first. */
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /**
     * Keys kept at most. Past it the one counted longest ago is let go, so
     * no stream of new addresses grows the window without end.
     */
    private readonly keysMax = 10_000,
  ) {}

  /** Whether the address has used its allowance up. */
  exceeded(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.limit;
  }

  /** Counts one more; true when it was still allowed. */
  take(key: string, now = Date.now()): boolean {
    const recent = this.recent(key, now);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.hits.delete(key);
    if (this.hits.size >= this.keysMax) {
      this.prune(now);
      for (const oldest of this.hits.keys()) {
        if (this.hits.size < this.keysMax) break;
        this.hits.delete(oldest);
      }
    }
    this.hits.set(key, recent);
    return true;
  }

  /** Forgets addresses whose window has passed. */
  prune(now = Date.now()) {
    for (const [key, times] of this.hits)
      if (!times.some((at) => at > now - this.windowMs)) this.hits.delete(key);
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((at) => at > now - this.windowMs);
  }
}

const HOUR = 60 * 60 * 1000;

export const authorizeLimit = new RateWindow(30, HOUR);
export const registerLimit = new RateWindow(10, HOUR);
export const tokenFailureLimit = new RateWindow(10, 60 * 1000);
/**
 * Descriptions of apps read from their addresses, by everyone together, under
 * the one key `all`: each is a request out of the site to an address anyone
 * may name, so the site makes only so many an hour whoever asks.
 */
export const documentLimit = new RateWindow(100, HOUR);

export function pruneOAuthLimits(now = Date.now()) {
  for (const window of [
    authorizeLimit,
    registerLimit,
    tokenFailureLimit,
    documentLimit,
  ])
    window.prune(now);
}
