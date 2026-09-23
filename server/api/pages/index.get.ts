import type { PublicPageListItem } from '#layers/thei/shared/api/page';
import type { PublicPaginatedResponse } from '#layers/thei/shared/api/public';
import {
  PUBLIC_DIRECTORY_PAGE_SIZE,
  publicPagination,
} from '../../thei/public/pagination';
import {
  buildPublicPageListItem,
  canListPublicEntity,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicPaginatedResponse<PublicPageListItem>> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const { db, schema } = THEI_SERVER.useDb();
    const pages = db
      .select()
      .from(schema.pages)
      .all()
      .filter((page) => canListPublicEntity(page.access, isAdmin))
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          right.createdAt - left.createdAt ||
          left.pageUuid.localeCompare(right.pageUuid),
      );
    const pagination = publicPagination(
      pages.length,
      getQuery(event).page,
      PUBLIC_DIRECTORY_PAGE_SIZE,
    );
    const offset = (pagination.page - 1) * pagination.pageSize;
    return {
      ...pagination,
      items: await Promise.all(
        pages
          .slice(offset, offset + pagination.pageSize)
          .map(buildPublicPageListItem),
      ),
    };
  },
);
