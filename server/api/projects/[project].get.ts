import type { PublicProjectResponse } from '#layers/thei/shared/api/public';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import {
  buildPublicProject,
  canOpenPublicEntity,
} from '../../thei/public/entities';
import { countLifePoints } from '../../thei/public/life';
import { resolveEntityViewer } from '../../thei/access-links/viewer';

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
    // The chronology itself is a tab of its own: the page only says how
    // many points it holds. What the newest of them would repeat is on the
    // page already — the status, the stages, the related entities.
    return {
      ...(await buildPublicProject(project, viewer)),
      timeline: {
        total: countLifePoints({
          scope: { kind: 'project', projectUuid: project.projectUuid },
        }),
      },
    };
  },
);
