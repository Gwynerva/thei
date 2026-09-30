import type { PublicTagResponse } from '#layers/thei/shared/api/public';
import { asc, desc, eq } from 'drizzle-orm';
import { publicIdFromTagUrlPart } from '#layers/thei/shared/tag-url';
import {
  buildPublicEventSummary,
  buildPublicProjectSummary,
  buildPublicTagListItems,
} from '../../thei/public/entities';
import { siteViewer } from '../../thei/access-links/viewer';
import {
  countPublicTagItems,
  publicTagItemFilters,
} from '../../thei/public/tags';
import { resolvePagination } from '#layers/thei/shared/pagination';
import { PUBLIC_PAGE_SIZE } from '../../thei/public/pagination';

export default defineEventHandler(async (event): Promise<PublicTagResponse> => {
  const {
    db,
    schema: { tags, projects, events },
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
  const { projectFilter, eventFilter } = publicTagItemFilters(
    tag.tagUuid,
    isAdmin,
  );
  const { projectCount, eventCount } = countPublicTagItems(
    tag.tagUuid,
    isAdmin,
  );
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
  const pagination = resolvePagination(
    activeTab === 'projects' ? projectCount : eventCount,
    query.page,
    PUBLIC_PAGE_SIZE,
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
            .map((item) => buildPublicProjectSummary(item, isAdmin)),
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
            .map((item) => buildPublicEventSummary(item, siteViewer(isAdmin))),
        );
  const [tagItem] = await buildPublicTagListItems([
    { tag, projectCount, eventCount },
  ]);
  return { ...tagItem!, activeTab, items: { ...pagination, items } };
});
