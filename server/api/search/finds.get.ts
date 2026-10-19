import type { SearchFind } from '#layers/thei/shared/search/api';
import { SEARCH_QUERY_MAX_LENGTH } from '#layers/thei/shared/search/tokens';
import {
  searchBudgetLeft,
  spendSearchTime,
  takeSearch,
} from '../../thei/search/limits';
import { findsOfResult } from '../../thei/search/query';
import { getRequestIp } from '../../thei/request';

/**
 * Every place one result of a search holds the words at: what its card's
 * «in N more places» opens. Read as the search reads it, for this reader.
 */
export default defineEventHandler(
  async (event): Promise<{ finds: SearchFind[]; more: number }> => {
    const query = getQuery(event);
    const q =
      typeof query.q === 'string'
        ? query.q.slice(0, SEARCH_QUERY_MAX_LENGTH)
        : '';
    const ref = typeof query.ref === 'string' ? query.ref : '';
    if (!q.trim() || !ref)
      throw createError({
        statusCode: 400,
        statusMessage: 'A query and a result are needed',
      });
    const isAdmin = await THEI_SERVER.isAdmin(event);
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
    const found = findsOfResult({
      q,
      ref,
      audience: isAdmin ? 'owner' : 'public',
      typing: query.typing === '1',
    });
    if (!isAdmin) spendSearchTime(performance.now() - started);
    if (!found)
      throw createError({ statusCode: 404, statusMessage: 'Not found' });
    return found;
  },
);
