import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import {
  buildPublicProject,
  canOpenPublicEntity,
} from '../../thei/public/entities';
import { countLifePoints, getLatestLifePoints } from '../../thei/public/life';
import {
  resolveEntityViewer,
  scopedViewer,
} from '../../thei/access-links/viewer';

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
    if (project.access === 'link-only')
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    const scope = {
      kind: 'project' as const,
      projectUuid: project.projectUuid,
    };
    const [response, latest] = await Promise.all([
      buildPublicProject(project, viewer),
      // A share link opens this project's own points, not the private points
      // of the events and diary entries gathered around it.
      getLatestLifePoints(PROJECT_TIMELINE_PREVIEW_SIZE, {
        scope,
        viewer: scopedViewer(viewer, 'project', project.projectUuid),
      }),
    ]);
    return {
      ...response,
      timeline: { latest, total: countLifePoints({ scope }) },
    };
  },
);
