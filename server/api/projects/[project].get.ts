import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import {
  buildPublicProject,
  canOpenPublicEntity,
} from '../../thei/public/entities';
import {
  listPublicProjectEvents,
  PROJECT_EVENTS_PREVIEW_SIZE,
} from '../../thei/public/project-events';

export default defineEventHandler(
  async (event): Promise<PublicProjectResponse> => {
    const part = getRouterParam(event, 'project') ?? '';
    const project =
      (await THEI_SERVER.projects.findByUuid(part)) ??
      (await THEI_SERVER.projects.findByPublicId(
        publicIdFromProjectUrlPart(part),
      ));
    if (!project)
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    const isAdmin = await THEI_SERVER.isAdmin(event);
    if (!canOpenPublicEntity(project.access, isAdmin))
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    if (project.access === 'link-only')
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    const [response, events] = await Promise.all([
      buildPublicProject(project, isAdmin),
      listPublicProjectEvents(project, isAdmin, 1, PROJECT_EVENTS_PREVIEW_SIZE),
    ]);
    return {
      ...response,
      relatedEvents: { items: events.items, total: events.total },
    };
  },
);
