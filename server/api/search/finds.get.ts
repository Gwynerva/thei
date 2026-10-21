import type { SearchFind } from '#layers/thei/shared/search/api';
import { SEARCH_QUERY_MAX_LENGTH } from '#layers/thei/shared/search/tokens';
import { withStrangerSearchLimits } from '../../thei/search/limits';
import { findsOfResult } from '../../thei/search/query';

/**
 * Every place one result of a search holds the words at: what its card's
 * «in N more places» opens. Read as the search reads it, for this reader,
 * within the same limits a stranger's search keeps.
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
    const found = await withStrangerSearchLimits(event, isAdmin, () =>
      findsOfResult({
        q,
        ref,
        audience: isAdmin ? 'owner' : 'public',
        typing: query.typing === '1',
      }),
    );
    if (!found)
      throw createError({ statusCode: 404, statusMessage: 'Not found' });
    return found;
  },
);
