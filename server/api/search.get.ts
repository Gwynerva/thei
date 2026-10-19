import type { SearchResponse } from '#layers/thei/shared/search/api';
import { parsePublicSearchFilters } from '#layers/thei/shared/public-search';
import { searchActions } from '../thei/search/actions';
import {
  searchBudgetLeft,
  spendSearchTime,
  takeSearch,
} from '../thei/search/limits';
import { cachedSearch } from '../thei/search/query';
import { getRequestIp } from '../thei/request';

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
  if (!isAdmin) {
    const wait = takeSearch(getRequestIp(event) ?? 'unknown');
    if (wait || !searchBudgetLeft()) {
      setResponseHeader(event, 'Retry-After', wait || 1);
      throw createError({
        statusCode: 429,
        statusMessage: 'Too Many Requests',
      });
    }
  }
  const started = performance.now();
  // The quick search with nothing typed finds nothing: only the owner is
  // offered something there, what to do.
  const response: SearchResponse =
    quick && !filters.q.trim()
      ? {
          query: '',
          total: 0,
          groups: [],
          facets: { kinds: {}, years: [], tags: [] },
          page: 1,
          pageCount: 1,
        }
      : await cachedSearch({
          q: filters.q,
          audience: isAdmin ? 'owner' : 'public',
          ...(filters.type ? { kind: filters.type } : {}),
          tags: filters.tags,
          exclude: filters.exclude,
          showcase: filters.showcase,
          cv: filters.cv,
          ...(filters.year ? { year: filters.year } : {}),
          page,
          quick,
          typing: query.typing === '1',
        });
  if (!isAdmin) spendSearchTime(performance.now() - started);
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
