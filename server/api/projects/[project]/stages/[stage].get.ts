import type { PublicProjectStageResponse } from '#layers/thei/shared/api/public';
import {
  publicIdFromProjectChildUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { getProjectStages } from '../../../../thei/projects/stages';
import {
  buildPublicProjectStage,
  canOpenPublicEntity,
} from '../../../../thei/public/entities';
import { buildProjectStageNeighbours } from '../../../../thei/public/neighbours';
import { resolveEntityViewer } from '../../../../thei/access-links/viewer';
import { markSharedResponse } from '../../../../thei/access-links/response';

export default defineEventHandler(
  async (event): Promise<PublicProjectStageResponse> => {
    const project = await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(getRouterParam(event, 'project') ?? ''),
    );
    if (!project)
      throw createError({ statusCode: 404, statusText: 'Project not found' });
    // A share link on the project covers its stages and sections too.
    const viewer = await resolveEntityViewer(
      event,
      'project',
      project.projectUuid,
    );
    if (!canOpenPublicEntity(project.access, viewer.asOwner))
      throw createError({ statusCode: 404, statusText: 'Stage not found' });
    const publicId = publicIdFromProjectChildUrlPart(
      getRouterParam(event, 'stage') ?? '',
    );
    const stages = await getProjectStages(project.projectUuid);
    const stage = stages.find((item) => item.publicId === publicId);
    if (!stage || (stage.isPrivate && !viewer.asOwner))
      throw createError({ statusCode: 404, statusText: 'Stage not found' });
    if (project.access === 'link-only' || viewer.viaShare)
      setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
    if (viewer.viaShare) markSharedResponse(event);
    const [response, neighbours] = await Promise.all([
      buildPublicProjectStage(project, stage, viewer.asOwner),
      buildProjectStageNeighbours(project, stages, stage, viewer.asOwner),
    ]);
    return { ...response, neighbours };
  },
);
