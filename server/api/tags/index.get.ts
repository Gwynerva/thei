import type { PublicTagListItem } from '#layers/thei/shared/api/public';
import {
  paginate,
  type PaginatedResponse,
} from '#layers/thei/shared/pagination';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { PUBLIC_DIRECTORY_PAGE_SIZE } from '../../thei/public/pagination';
import {
  buildPublicTagListItems,
  canListPublicEntity,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PaginatedResponse<PublicTagListItem>> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const { db, schema } = THEI_SERVER.useDb();
    const visible = (rows: { id: string; access: ProjectEventAccessLevel }[]) =>
      new Set(
        rows
          .filter((row) => canListPublicEntity(row.access, isAdmin))
          .map((row) => row.id),
      );
    const visibleProjects = visible(
      db
        .select({
          id: schema.projects.projectUuid,
          access: schema.projects.access,
        })
        .from(schema.projects)
        .all(),
    );
    const visibleEvents = visible(
      db
        .select({ id: schema.events.eventUuid, access: schema.events.access })
        .from(schema.events)
        .all(),
    );
    // One pass over the usages, rather than one per tag.
    const counts = new Map<
      string,
      { projectCount: number; eventCount: number }
    >();
    for (const usage of db.select().from(schema.tagUsages).all()) {
      const isProject =
        usage.containerType === 'project' &&
        visibleProjects.has(usage.containerId);
      const isEvent =
        usage.containerType === 'event' && visibleEvents.has(usage.containerId);
      if (!isProject && !isEvent) continue;
      const count = counts.get(usage.tagUuid) ?? {
        projectCount: 0,
        eventCount: 0,
      };
      if (isProject) count.projectCount++;
      else count.eventCount++;
      counts.set(usage.tagUuid, count);
    }
    const rows = db
      .select()
      .from(schema.tags)
      .all()
      .map((tag) => ({
        tag,
        ...(counts.get(tag.tagUuid) ?? { projectCount: 0, eventCount: 0 }),
      }))
      .filter((item) => item.projectCount + item.eventCount > 0)
      .sort(
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
