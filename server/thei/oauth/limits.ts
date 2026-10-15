/**
 * How often one address may do what costs the site something: ask for a
 * connection, register an app, fail to exchange a key. Counted in memory
 * over a sliding window; a restart forgets, which errs on the open side.
 */
export class RateWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
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

export function pruneOAuthLimits(now = Date.now()) {
  for (const window of [authorizeLimit, registerLimit, tokenFailureLimit])
    window.prune(now);
}
