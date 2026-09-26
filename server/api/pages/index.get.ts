import type { PublicPageListItem } from '#layers/thei/shared/api/page';
import {
  paginate,
  type PaginatedResponse,
} from '#layers/thei/shared/pagination';
import { PUBLIC_DIRECTORY_PAGE_SIZE } from '../../thei/public/pagination';
import {
  buildPublicPageListItem,
  canListPublicEntity,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PaginatedResponse<PublicPageListItem>> => {
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
    const paged = paginate(
      pages,
      getQuery(event).page,
      PUBLIC_DIRECTORY_PAGE_SIZE,
    );
    return {
      ...paged,
      items: await Promise.all(paged.items.map(buildPublicPageListItem)),
    };
  },
);
