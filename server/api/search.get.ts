import {
  emptySearchResponse,
  type SearchResponse,
} from '#layers/thei/shared/search/api';
import { parsePublicSearchFilters } from '#layers/thei/shared/public-search';
import { utcDayOf } from '#layers/thei/shared/date-range';
import { searchActions } from '../thei/search/actions';
import { withStrangerSearchLimits } from '../thei/search/limits';
import {
  cachedSearch,
  peekCachedSearch,
  type SearchRequest,
} from '../thei/search/query';

/**
 * The site's search: with a query, what it finds across the site for this
 * reader; without one, the catalogue. The owner searches everything and, in
 * the quick search, is offered what to do. A stranger's search keeps the
 * limits (`search/limits.ts`); an answer remembered costs nothing to give
 * again.
 */
export default defineEventHandler(async (event): Promise<SearchResponse> => {
  const query = getQuery(event);
  const { page, ...filters } = parsePublicSearchFilters(query);
  const isAdmin = await THEI_SERVER.isAdmin(event);
  const quick = query.quick === '1';
  // The reader's own day, when the page says it: «вчера» is theirs.
  const today =
    typeof query.today === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(query.today)
      ? query.today
      : utcDayOf(Date.now());
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
    today,
  };
  // The quick search with nothing typed finds nothing, and costs nothing:
  // the owner is offered what to do, a visitor their own history, kept in
  // the browser.
  const response =
    quick && !filters.q.trim()
      ? emptySearchResponse()
      : await withStrangerSearchLimits(
          event,
          isAdmin,
          () => cachedSearch(request),
          () => peekCachedSearch(request),
        );
  if (!isAdmin || !quick) return response;
  return {
    ...response,
    actions: await searchActions({
      q: filters.q,
      today,
      ...(typeof query.path === 'string' ? { path: query.path } : {}),
    }),
  };
});
