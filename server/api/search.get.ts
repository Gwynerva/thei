import {
  emptySearchResponse,
  type SearchResponse,
} from '#layers/thei/shared/search/api';
import { parsePublicSearchFilters } from '#layers/thei/shared/public-search';
import type { H3Event } from 'h3';
import { searchActions } from '../thei/search/actions';
import {
  searchBudgetWait,
  spendSearchTime,
  takeSearch,
} from '../thei/search/limits';
import { popularTagTitles } from '../thei/search/catalogue';
import {
  cachedSearch,
  peekCachedSearch,
  type SearchRequest,
} from '../thei/search/query';
import { requestClient } from '../thei/request';

/**
 * The site's search: with a query, what it finds across the site for this
 * reader; without one, the catalogue. The owner searches everything and, in
 * the quick search, is offered what to do.
 */
export default defineEventHandler(async (event): Promise<SearchResponse> => {
  const query = getQuery(event);
  const { page, ...filters } = parsePublicSearchFilters(query);
  const isAdmin = await THEI_SERVER.isAdmin(event);
  const quick = query.quick === '1';
  const request: SearchRequest = {
    q: filters.q,
    audience: isAdmin ? 'owner' : 'public',
    ...(filters.type ? { kind: filters.type } : {}),
    tags: filters.tags,
    exclude: filters.exclude,
    showcase: filters.showcase,
    cv: filters.cv,
    ...(filters.year ? { year: filters.year } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
    page,
    quick,
    typing: query.typing === '1',
  };
  const empty = quick && !filters.q.trim();
  const found = isAdmin
    ? await answer(request, empty, isAdmin)
    : await limitedAnswer(event, request, empty);
  // Nothing found: what the site is about, as other words to try.
  const response =
    filters.q.trim() && !found.total
      ? { ...found, suggestions: popularTagTitles(isAdmin) }
      : found;
  if (!isAdmin || !quick) return response;
  const today =
    typeof query.today === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(query.today)
      ? query.today
      : new Date().toISOString().slice(0, 10);
  return {
    ...response,
    actions: searchActions({
      q: filters.q,
      today,
      ...(typeof query.path === 'string' ? { path: query.path } : {}),
    }),
  };
});

/**
 * The quick search with nothing typed finds nothing: it offers words to try,
 * and the owner what to do.
 */
async function answer(
  request: SearchRequest,
  empty: boolean,
  isAdmin: boolean,
): Promise<SearchResponse> {
  return empty
    ? { ...emptySearchResponse(), suggestions: popularTagTitles(isAdmin) }
    : await cachedSearch(request);
}

/**
 * A stranger's search, within the limits (`search/limits.ts`): the bucket
 * of the visitor — the page's own one while a page is rendered — then an
 * answer remembered, which costs nothing, then the time all strangers share.
 */
async function limitedAnswer(
  event: H3Event,
  request: SearchRequest,
  empty: boolean,
): Promise<SearchResponse> {
  const client = requestClient(event);
  const wait = takeSearch(client.address ?? 'unknown');
  if (wait) refuse(event, 429, wait);
  if (!empty) {
    const known = peekCachedSearch(request);
    if (known) return known;
  }
  const busy = searchBudgetWait({ rendering: client.rendering });
  if (busy) refuse(event, 503, busy);
  const started = performance.now();
  try {
    return await answer(request, empty, false);
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
