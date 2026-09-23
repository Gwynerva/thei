import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import {
  buildPublicProject,
  canOpenPublicEntity,
} from '../../thei/public/entities';
import { countLifePoints, getLatestLifePoints } from '../../thei/public/life';
import { resolveEntityViewer } from '../../thei/access-links/viewer';
import { markSharedResponse } from '../../thei/access-links/response';

/** How many of the newest chronology points the overview tab shows. */
const PROJECT_TIMELINE_PREVIEW_SIZE = 3;

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
    // The chronology is built for the visitor the reader really is: a share
    // link opens this project, not the private points of everything around it.
    const scope = {
      kind: 'project' as const,
      projectUuid: project.projectUuid,
    };
    const [response, latest] = await Promise.all([
      buildPublicProject(project, viewer.asOwner),
      getLatestLifePoints(PROJECT_TIMELINE_PREVIEW_SIZE, {
        scope,
        isAdmin: viewer.isAdmin,
      }),
    ]);
    return {
      ...response,
      timeline: { latest, total: countLifePoints({ scope }) },
    };
  },
);
