import type {
  PublicTagListItem,
  PublicPaginatedResponse,
} from '#layers/thei/shared/api/public';
import {
  PUBLIC_DIRECTORY_PAGE_SIZE,
  publicPagination,
} from '../../thei/public/pagination';
import {
  buildPublicTagListItems,
  canListPublicEntity,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicPaginatedResponse<PublicTagListItem>> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const { db, schema } = THEI_SERVER.useDb();
    const [tags, usages, projects, events] = [
      db.select().from(schema.tags).all(),
      db.select().from(schema.tagUsages).all(),
      db.select().from(schema.projects).all(),
      db.select().from(schema.events).all(),
    ];
    const visibleProjects = new Set(
      projects
        .filter((item) => canListPublicEntity(item.access, isAdmin))
        .map((item) => item.projectUuid),
    );
    const visibleEvents = new Set(
      events
        .filter((item) => canListPublicEntity(item.access, isAdmin))
        .map((item) => item.eventUuid),
    );
    const rows = tags
      .map((tag) => ({
        tag,
        projectCount: usages.filter(
          (usage) =>
            usage.tagUuid === tag.tagUuid &&
            usage.containerType === 'project' &&
            visibleProjects.has(usage.containerId),
        ).length,
        eventCount: usages.filter(
          (usage) =>
            usage.tagUuid === tag.tagUuid &&
            usage.containerType === 'event' &&
            visibleEvents.has(usage.containerId),
        ).length,
      }))
      .filter((item) => item.projectCount + item.eventCount > 0)
      .sort(
        (left, right) =>
          left.tag.title.localeCompare(right.tag.title) ||
          left.tag.publicId.localeCompare(right.tag.publicId),
      );
    const pagination = publicPagination(
      rows.length,
      getQuery(event).page,
      PUBLIC_DIRECTORY_PAGE_SIZE,
    );
    const offset = (pagination.page - 1) * pagination.pageSize;
    return {
      ...pagination,
      items: await buildPublicTagListItems(
        rows.slice(offset, offset + pagination.pageSize),
      ),
    };
  },
);
