import type { PublicSearchResponse } from '#layers/thei/shared/api/public';
import { parsePublicSearchFilters } from '#layers/thei/shared/public-search';
import { runPublicSearch } from '../thei/public/search-index';

export default defineEventHandler(
  async (event): Promise<PublicSearchResponse> => {
    const { page, ...filters } = parsePublicSearchFilters(getQuery(event));
    const isAdmin = await THEI_SERVER.isAdmin(event);
    return runPublicSearch(filters, page, isAdmin);
  },
);
