/**
 * What keeps a public search from taking the site down.
 *
 * Node answers every request on one thread and a query to SQLite holds it
 * while it runs, so a flood of searches makes every other page wait. Two
 * guards stand in the way, both for strangers only — the owner and MCP have
 * their own:
 *
 * - each address has a bucket of searches that refills a little every
 *   second, enough for typing and paging;
 * - all strangers together may spend only a share of each second searching;
 *   past it a search is turned away at once instead of queued behind the
 *   others, so the rest of the site keeps answering.
 */

const BUCKET = 20;
const REFILL_PER_SECOND = 2;
const BUDGET_SHARE = 0.3;
const WINDOW_MS = 1000;
/** Addresses not seen for this long are forgotten. */
const FORGET_MS = 60_000;

const buckets = new Map<string, { tokens: number; at: number }>();
let window = { start: 0, spent: 0 };

/**
 * Takes one search from an address's bucket. The seconds to wait when it is
 * empty, or 0.
 */
export function takeSearch(address: string, now = Date.now()): number {
  const bucket = buckets.get(address) ?? { tokens: BUCKET, at: now };
  bucket.tokens = Math.min(BUCKET, bucket.tokens + ((now - bucket.at) / 1000) * REFILL_PER_SECOND);
  bucket.at = now;
  buckets.set(address, bucket);
  if (buckets.size > 1000 && Math.random() < 0.01)
    for (const [key, value] of buckets) if (now - value.at > FORGET_MS) buckets.delete(key);
  if (bucket.tokens < 1) return Math.ceil((1 - bucket.tokens) / REFILL_PER_SECOND);
  bucket.tokens -= 1;
  return 0;
}

/** Whether strangers may still search in this second. */
export function searchBudgetLeft(now = Date.now()): boolean {
  if (now - window.start >= WINDOW_MS) window = { start: now, spent: 0 };
  return window.spent < WINDOW_MS * BUDGET_SHARE;
}

/** Counts the time a stranger's search took. */
export function spendSearchTime(ms: number, now = Date.now()) {
  if (now - window.start >= WINDOW_MS) window = { start: now, spent: 0 };
  window.spent += ms;
}

/** Forgets every bucket and the budget: for tests. */
export function resetSearchLimits() {
  buckets.clear();
  window = { start: 0, spent: 0 };
}
