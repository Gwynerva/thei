import type { PublicPageListItem } from '#layers/thei/shared/api/page';
import {
  buildPublicPageListItem,
  canListPublicEntity,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicPageListItem[]> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const requested = Number(getQuery(event).limit);
    const limit = Number.isInteger(requested)
      ? Math.min(100, Math.max(1, requested))
      : undefined;
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
    return Promise.all(
      (limit === undefined ? pages : pages.slice(0, limit)).map(
        buildPublicPageListItem,
      ),
    );
  },
);
