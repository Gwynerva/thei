import { createError, setResponseHeader, type H3Event } from 'h3';
import { requestClient } from '../request';

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
 * - all strangers together may keep the server searching only a share of
 *   the time. What they spend is a debt that drains at that share; past a
 *   ceiling a search is turned away at once instead of queued behind the
 *   others, so the rest of the site keeps answering. A page rendered on the
 *   server has a higher ceiling than a search typed, so the catalogue opens
 *   while typing waits, and the debt never grows past a few seconds, so the
 *   site comes back as soon as the flood stops.
 */

const BUCKET = 20;
const REFILL_PER_SECOND = 2;
/** The share of the time strangers' searches may keep the server busy. */
const BUDGET_SHARE = 0.3;
/** The debt past which a search typed waits, and a page rendered. */
const CEILING_MS = 300;
const RENDER_CEILING_MS = 600;
/** The most debt carried forward. */
const DEBT_MAX_MS = 3000;
/** Addresses not seen for this long are forgotten. */
const FORGET_MS = 60_000;

const buckets = new Map<string, { tokens: number; at: number }>();
let budget = { debt: 0, at: 0 };

/**
 * Takes one search from an address's bucket. The seconds to wait when it is
 * empty, or 0.
 */
export function takeSearch(address: string, now = Date.now()): number {
  const bucket = buckets.get(address) ?? { tokens: BUCKET, at: now };
  bucket.tokens = Math.min(
    BUCKET,
    bucket.tokens + ((now - bucket.at) / 1000) * REFILL_PER_SECOND,
  );
  bucket.at = now;
  buckets.set(address, bucket);
  if (buckets.size > 1000 && Math.random() < 0.01)
    for (const [key, value] of buckets)
      if (now - value.at > FORGET_MS) buckets.delete(key);
  if (bucket.tokens < 1)
    return Math.ceil((1 - bucket.tokens) / REFILL_PER_SECOND);
  bucket.tokens -= 1;
  return 0;
}

/** The debt as it stands now, drained since it was last counted. */
function settle(now: number) {
  budget = {
    debt: Math.max(0, budget.debt - (now - budget.at) * BUDGET_SHARE),
    at: now,
  };
}

/**
 * Whether strangers may search now: 0 when they may, else the seconds until
 * the debt is back under the ceiling — higher for a page being rendered.
 */
export function searchBudgetWait(
  { rendering = false }: { rendering?: boolean } = {},
  now = Date.now(),
): number {
  settle(now);
  const ceiling = rendering ? RENDER_CEILING_MS : CEILING_MS;
  if (budget.debt < ceiling) return 0;
  return Math.max(1, Math.ceil((budget.debt - ceiling) / BUDGET_SHARE / 1000));
}

/** Counts the time a stranger's search took. */
export function spendSearchTime(ms: number, now = Date.now()) {
  settle(now);
  budget.debt = Math.min(DEBT_MAX_MS, budget.debt + ms);
}

/** Forgets every bucket and the budget: for tests. */
export function resetSearchLimits() {
  buckets.clear();
  budget = { debt: 0, at: 0 };
}

/**
 * A stranger's search, or a part of one, within these limits: the bucket of
 * the visitor — the page's own one while a page is rendered — then what
 * `free` answers at no cost, an answer remembered, then the time all
 * strangers share, which `work` spends. The owner's runs as it is.
 */
export async function withStrangerSearchLimits<T>(
  event: H3Event,
  isAdmin: boolean,
  work: () => T | Promise<T>,
  free?: () => T | undefined,
): Promise<T> {
  if (isAdmin) return await work();
  const client = requestClient(event);
  const wait = takeSearch(client.address ?? 'unknown');
  if (wait) refuse(event, 429, wait);
  const known = free?.();
  if (known !== undefined) return known;
  const busy = searchBudgetWait({ rendering: client.rendering });
  if (busy) refuse(event, 503, busy);
  const started = performance.now();
  try {
    return await work();
  } finally {
    spendSearchTime(performance.now() - started);
  }
}

function refuse(event: H3Event, status: 429 | 503, seconds: number): never {
  setResponseHeader(event, 'Retry-After', seconds);
  throw createError({
    statusCode: status,
    statusMessage: status === 429 ? 'Too Many Requests' : 'Service Unavailable',
  });
}
