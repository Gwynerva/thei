import type { PublicTagResponse } from '#layers/thei/shared/api/public';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { publicIdFromTagUrlPart } from '#layers/thei/shared/tag-url';
import {
  buildPublicEventSummary,
  buildPublicProjectSummary,
  buildPublicTagListItems,
} from '../../thei/public/entities';
import { publicPagination } from '../../thei/public/pagination';

export default defineEventHandler(async (event): Promise<PublicTagResponse> => {
  const {
    db,
    schema: { tags, tagUsages, projects, events },
  } = THEI_SERVER.useDb();
  const tag = db
    .select()
    .from(tags)
    .where(
      eq(
        tags.publicId,
        publicIdFromTagUrlPart(getRouterParam(event, 'tag') ?? ''),
      ),
    )
    .get();
  if (!tag) throw createError({ statusCode: 404, statusText: 'Tag not found' });
  const isAdmin = await THEI_SERVER.isAdmin(event);
  const tagged = (type: 'project' | 'event') =>
    db
      .select({ id: tagUsages.containerId })
      .from(tagUsages)
      .where(
        and(
          eq(tagUsages.tagUuid, tag.tagUuid),
          eq(tagUsages.containerType, type),
        ),
      );
  const projectFilter = and(
    inArray(projects.projectUuid, tagged('project')),
    isAdmin ? undefined : eq(projects.access, ProjectEventAccessLevel.Public),
  );
  const eventFilter = and(
    inArray(events.eventUuid, tagged('event')),
    isAdmin ? undefined : eq(events.access, ProjectEventAccessLevel.Public),
  );
  const projectCount = db
    .select({ count: count() })
    .from(projects)
    .where(projectFilter)
    .get()!.count;
  const eventCount = db
    .select({ count: count() })
    .from(events)
    .where(eventFilter)
    .get()!.count;
  if (!projectCount && !eventCount)
    throw createError({ statusCode: 404, statusText: 'Tag not found' });
  const query = getQuery(event);
  const requestedTab = query.tab === 'events' ? 'events' : 'projects';
  const activeTab =
    requestedTab === 'projects' && !projectCount
      ? 'events'
      : requestedTab === 'events' && !eventCount
        ? 'projects'
        : requestedTab;
  const pagination = publicPagination(
    activeTab === 'projects' ? projectCount : eventCount,
    query.page,
  );
  const offset = (pagination.page - 1) * pagination.pageSize;
  const items =
    activeTab === 'projects'
      ? await Promise.all(
          db
            .select()
            .from(projects)
            .where(projectFilter)
            .orderBy(desc(projects.createdAt), asc(projects.projectUuid))
            .limit(pagination.pageSize)
            .offset(offset)
            .all()
            .map(buildPublicProjectSummary),
        )
      : await Promise.all(
          db
            .select()
            .from(events)
            .where(eventFilter)
            .orderBy(desc(events.updatedAt), asc(events.eventUuid))
            .limit(pagination.pageSize)
            .offset(offset)
            .all()
            .map((item) => buildPublicEventSummary(item, isAdmin)),
        );
  const [tagItem] = await buildPublicTagListItems([
    { tag, projectCount, eventCount },
  ]);
  return { ...tagItem!, activeTab, items: { ...pagination, items } };
});
