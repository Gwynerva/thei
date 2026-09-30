import type { PublicTagListItem } from '#layers/thei/shared/api/public';
import {
  paginate,
  type PaginatedResponse,
} from '#layers/thei/shared/pagination';
import { PUBLIC_DIRECTORY_PAGE_SIZE } from '../../thei/public/pagination';
import { buildPublicTagListItems } from '../../thei/public/entities';
import { listPublicTagCounts } from '../../thei/public/tags';

export default defineEventHandler(
  async (event): Promise<PaginatedResponse<PublicTagListItem>> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const rows = listPublicTagCounts(isAdmin).sort(
      (left, right) =>
        left.tag.title.localeCompare(right.tag.title) ||
        left.tag.publicId.localeCompare(right.tag.publicId),
    );
    const paged = paginate(
      rows,
      getQuery(event).page,
      PUBLIC_DIRECTORY_PAGE_SIZE,
    );
    return {
      ...paged,
      items: await buildPublicTagListItems(paged.items),
    };
  },
);
