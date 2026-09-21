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
import { resolveEntityViewer } from '../../thei/access-links/viewer';
import { markSharedResponse } from '../../thei/access-links/response';

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
    // The share link widens the view of this project only: related events
    // and projects are still built for the visitor the reader really is.
    const viewer = await resolveEntityViewer(
      event,
      'project',
      project.projectUuid,
    );
    if (!canOpenPublicEntity(project.access, viewer.asOwner))
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    if (project.access === 'link-only' || viewer.viaShare)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    if (viewer.viaShare) markSharedResponse(event);
    const [response, events] = await Promise.all([
      buildPublicProject(project, viewer.asOwner),
      listPublicProjectEvents(
        project,
        viewer.isAdmin,
        1,
        PROJECT_EVENTS_PREVIEW_SIZE,
      ),
    ]);
    return {
      ...response,
      relatedEvents: { items: events.items, total: events.total },
    };
  },
);
