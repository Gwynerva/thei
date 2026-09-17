import type { PublicProjectEventsResponse } from '#layers/thei/shared/api/public';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import {
  buildPublicProjectChildParent,
  canOpenPublicEntity,
} from '../../../thei/public/entities';
import {
  listPublicProjectEvents,
  PROJECT_EVENTS_PAGE_SIZE,
} from '../../../thei/public/project-events';

export default defineEventHandler(
  async (event): Promise<PublicProjectEventsResponse> => {
    const project = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!project)
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    const isAdmin = await THEI_SERVER.isAdmin(event);
    if (!canOpenPublicEntity(project.access, isAdmin))
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    if (project.access === 'link-only')
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    const [events, parent] = await Promise.all([
      listPublicProjectEvents(
        project,
        isAdmin,
        getQuery(event).page,
        PROJECT_EVENTS_PAGE_SIZE,
      ),
      buildPublicProjectChildParent(project),
    ]);
    return { ...events, project: parent };
  },
);
