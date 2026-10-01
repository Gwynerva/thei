import type { PublicPageListItem } from '#layers/thei/shared/api/page';
import {
  paginate,
  type PaginatedResponse,
} from '#layers/thei/shared/pagination';
import { PUBLIC_DIRECTORY_PAGE_SIZE } from '../../thei/public/pagination';
import {
  buildPublicPageListItem,
  listPublicPages,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PaginatedResponse<PublicPageListItem>> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const paged = paginate(
      listPublicPages(isAdmin),
      getQuery(event).page,
      PUBLIC_DIRECTORY_PAGE_SIZE,
    );
    return {
      ...paged,
      items: await Promise.all(paged.items.map(buildPublicPageListItem)),
    };
  },
);
